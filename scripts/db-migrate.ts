import { loadStorageEnv } from '../src/config/env.js';
import { safeError } from '../src/utils/errors.js';
import { runMigrations } from '../src/storage/postgres/migrate.js';

async function main(): Promise<void> {
  const { databaseUrl } = loadStorageEnv();
  await runMigrations(databaseUrl);
  console.log('migrations applied');
}

main().catch((err: unknown) => {
  const e = safeError(err);
  console.error(`Migration failed: ${e.name}: ${e.message}`);
  // drizzle wraps the driver error; the cause explains why (connection refused, authentication failed, ...).
  if (err instanceof Error && err.cause !== undefined) {
    const cause = safeError(err.cause);
    console.error(`Cause: ${cause.name}: ${cause.message}`);
  }
  process.exit(1);
});
