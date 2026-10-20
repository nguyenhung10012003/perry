import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  MIGRATE_LOCK_TIMEOUT_MS,
  MIGRATION_ADVISORY_LOCK_KEY,
  STORAGE_CONNECT_TIMEOUT_MS,
} from "../../config/constants.js";

/** Works from src (tsx) and from dist: both sit three levels below the repository root. */
const migrationsFolder = fileURLToPath(
  new URL("../../../drizzle", import.meta.url),
);

/**
 * Applies pending migrations from the versioned drizzle/ folder. Idempotent.
 * A session-level advisory lock on a dedicated connection serializes concurrent runs (several containers
 * starting together, or `npm run db:migrate` next to a booting bot). Closing the connection releases the lock,
 * also after a crash.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const lock = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: STORAGE_CONNECT_TIMEOUT_MS,
    query_timeout: MIGRATE_LOCK_TIMEOUT_MS,
    application_name: "perry-migrate-lock",
  });
  lock.on("error", () => undefined);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: STORAGE_CONNECT_TIMEOUT_MS,
    application_name: "perry-migrate",
  });
  pool.on("error", () => undefined);
  try {
    await lock.connect();
    await lock.query("select pg_advisory_lock($1::bigint)", [
      MIGRATION_ADVISORY_LOCK_KEY,
    ]);
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
    await lock.end().catch(() => undefined);
  }
}
