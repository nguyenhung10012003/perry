import { setTimeout as sleep } from 'node:timers/promises';
import { MIGRATE_ATTEMPTS, MIGRATE_RETRY_DELAY_MS } from '../config/constants.js';
import type { Config } from '../config/env.js';
import { runMigrations } from '../storage/postgres/migrate.js';
import { safeError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';

export interface MigrateOnStartOptions {
  attempts?: number;
  delayMs?: number;
}

/**
 * Applies pending migrations when the bot starts, retrying while Postgres is still booting.
 * Never throws: after the last attempt it logs one error and returns false so the bot continues in its
 * degraded mode (storage problems never crash the bot).
 */
export async function migrateOnStart(
  config: Pick<Config, 'storage'>,
  logger: Logger,
  options: MigrateOnStartOptions = {},
): Promise<boolean> {
  const databaseUrl = config.storage.databaseUrl;
  if (databaseUrl === undefined) return false;
  const attempts = options.attempts ?? MIGRATE_ATTEMPTS;
  const delayMs = options.delayMs ?? MIGRATE_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await runMigrations(databaseUrl);
      logger.info('Database migrations applied');
      return true;
    } catch (err) {
      if (attempt < attempts) {
        if (attempt === 1) logger.warn({ err: safeError(err) }, 'Postgres is not ready for migrations, retrying');
        await sleep(delayMs);
        continue;
      }
      const cause = err instanceof Error && err.cause !== undefined ? safeError(err.cause) : undefined;
      logger.error(
        { err: safeError(err), cause, attempts },
        'Database migrations failed. Check POSTGRES_PASSWORD and the postgres container, then restart the bot',
      );
    }
  }
  return false;
}
