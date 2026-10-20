import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { PG_POOL_CONNECT_TIMEOUT_MS, PG_QUERY_TIMEOUT_MS } from '../../config/constants.js';
import { safeError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface PostgresClient {
  readonly pool: pg.Pool;
  readonly db: Database;
}

/** SQLSTATE of the failed query. drizzle wraps driver errors, so the code may sit on `cause`. */
export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { code, cause } = err as { code?: unknown; cause?: unknown };
  if (typeof code === 'string') return code;
  if (typeof cause === 'object' && cause !== null) {
    const inner = (cause as { code?: unknown }).code;
    if (typeof inner === 'string') return inner;
  }
  return undefined;
}

/** SQLSTATE for "undefined table": migrations have not been applied. */
export const PG_UNDEFINED_TABLE = '42P01';

/** SQLSTATE for "undefined column": a newer migration (e.g. 0001 guild language) has not been applied. */
export const PG_UNDEFINED_COLUMN = '42703';

/** Creates the pool lazily: no connection is opened until the first query. */
export function createPostgres(databaseUrl: string, logger: Logger): PostgresClient {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: PG_POOL_CONNECT_TIMEOUT_MS,
    query_timeout: PG_QUERY_TIMEOUT_MS,
    application_name: 'perry-bot',
  });
  // Mandatory: an idle client that loses its connection emits 'error' on the pool, unhandled it would crash the process.
  pool.on('error', (err) => {
    logger.debug({ err: safeError(err) }, 'Postgres idle client error');
  });
  return { pool, db: drizzle(pool, { schema }) };
}

/**
 * Probes the schema, including the newest column (guild_settings.language). Resolves true when it is current;
 * false when migrations are missing or outdated (logs the single "run npm run db:migrate" line).
 * Other failures are rethrown.
 */
export async function ensureSchema(db: Database, logger: Logger): Promise<boolean> {
  try {
    await db.execute(sql`select language from guild_settings limit 0`);
    return true;
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN) {
      logger.error('Database schema is missing or outdated. Run "npm run db:migrate" and restart the bot');
      return false;
    }
    throw err;
  }
}
