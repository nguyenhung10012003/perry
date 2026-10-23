import 'server-only';
import { STORAGE_CLOSE_TIMEOUT_MS, STORAGE_STARTUP_TIMEOUT_MS } from '../../src/config/constants.js';
import { BackendHealth } from '../../src/storage/health.js';
import { createKeys } from '../../src/storage/keys.js';
import { createPostgres, ensureSchema, SCHEMA_PROBE } from '../../src/storage/postgres/client.js';
import { createRedis } from '../../src/storage/redis/client.js';
import { createSettingsPublisher } from '../../src/storage/redis/pubsub.js';
import { RedisRateLimiter } from '../../src/storage/redis/redis-cooldowns.js';
import { childLogger, createLogger } from '../../src/utils/logger.js';
import type { Logger } from '../../src/utils/logger.js';
import { settleWithin, withTimeout } from '../../src/utils/timeout.js';
import { createBridgeClient } from './bridge-client.js';
import { loadWebConfig } from './config.js';
import { deriveSealKey } from './crypto.js';
import type { WebDeps } from './deps.js';
import { createDiscordApi } from './discord-api.js';
import { ApiError, errorResponse, isApiError } from './errors.js';
import { createGuildData } from './guild-data.js';
import type { Handler, HandlerFactory } from './handler.js';
import { createOAuthStateStore } from './oauth.js';
import { createWebRateLimits } from './rate-limit.js';
import { createRedisRawCache } from './raw-cache.js';
import { createSessionStore } from './session.js';
import { createLevelsGateway, createPublicLeaderboardCache, createSettingsGateway } from './settings-writer.js';

/** ensureSchema hint of the web: its probe recovers on its own once the bot has migrated. */
export const WEB_SCHEMA_HINT = 'Waiting for the bot to apply the migrations (npm run db:migrate on a host install)';

/** One runtime per process: Next bundles instrumentation and each route as separate webpack entries. */
const processGlobal = globalThis as typeof globalThis & {
  __perryWeb?: WebDeps;
  __perryWebStarting?: Promise<WebDeps>;
};

/**
 * Starts the web runtime once per server process (called by instrumentation.ts register()): config (exit 1 on invalid
 * env), Postgres and Redis with the bot's start sequence (neither failure stops the process: the web starts degraded
 * and answers 503 until recovery), then the WebDeps singleton and the shutdown hooks.
 */
export function startWebRuntime(): Promise<WebDeps> {
  processGlobal.__perryWebStarting ??= start();
  return processGlobal.__perryWebStarting;
}

async function start(): Promise<WebDeps> {
  const config = loadWebConfig();
  let logger: Logger;
  try {
    logger = createLogger(config);
  } catch {
    // LOG_PRETTY=true needs pino-pretty, which the standalone output does not ship: fall back to JSON lines.
    logger = createLogger({ ...config, logPretty: false });
    logger.warn('LOG_PRETTY is not available in the web server; logging JSON lines');
  }
  const log = childLogger(logger, 'web');
  const storageLog = childLogger(logger, 'storage');
  const keys = createKeys(config.keyPrefix);

  const postgres = createPostgres(config.databaseUrl, storageLog, 'perry-web');
  const pgHealth = new BackendHealth({
    name: 'Postgres',
    logger: storageLog,
    probe: async () => {
      await postgres.db.execute(SCHEMA_PROBE);
    },
  });
  let schemaOutdated = false;
  pgHealth.onRecover(() => {
    schemaOutdated = false;
  });
  const startPostgres = async (): Promise<void> => {
    try {
      const ready = await withTimeout(ensureSchema(postgres.db, storageLog, WEB_SCHEMA_HINT), STORAGE_STARTUP_TIMEOUT_MS);
      if (ready) pgHealth.markUp();
      else {
        schemaOutdated = true;
        // Quiet: ensureSchema already logged the outdated-schema line.
        pgHealth.markDown(new Error('Database schema is missing or outdated'), true);
      }
    } catch (err) {
      pgHealth.markDown(err);
    }
  };

  const redis = createRedis(config.redisUrl, storageLog, 'perry-web');
  const startRedis = async (): Promise<void> => {
    const ready = await redis.waitReady(STORAGE_STARTUP_TIMEOUT_MS);
    if (!ready) redis.health.markDown(new Error(`Not reachable within ${STORAGE_STARTUP_TIMEOUT_MS} ms`));
  };
  await Promise.all([startPostgres(), startRedis()]);

  const cache = createRedisRawCache(redis.client, redis.health);
  const sessions = createSessionStore(cache, keys);
  const discord = createDiscordApi(config, log);
  const bridge = createBridgeClient({ cache, keys, logger: log });
  const gatewayDeps = { db: postgres.db, pg: pgHealth, schemaOutdated: () => schemaOutdated };
  const deps: WebDeps = {
    config,
    logger: log,
    keys,
    sealKey: deriveSealKey(config.sessionSecret),
    sessions,
    oauthStates: createOAuthStateStore(cache, keys),
    rateLimits: createWebRateLimits(new RedisRateLimiter(redis.client, redis.health, keys)),
    discord,
    guildData: createGuildData({ cache, keys, discord, bridge, sessions, logger: log }),
    bridge,
    settings: createSettingsGateway({
      ...gatewayDeps,
      cache,
      redis: redis.health,
      keys,
      publisher: createSettingsPublisher(redis.client, redis.health, keys.settingsEvents()),
      logger: log,
    }),
    levels: createLevelsGateway(gatewayDeps),
    publicLeaderboards: createPublicLeaderboardCache(cache, keys),
    health: {
      postgresUp: () => pgHealth.isUp,
      redisUp: () => redis.health.isUp,
      schemaOutdated: () => schemaOutdated,
    },
    now: Date.now,
  };
  processGlobal.__perryWeb = deps;

  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    // Best effort: the Next.js server finishes in-flight requests and exits on its own.
    pgHealth.stop();
    void Promise.all([redis.close(STORAGE_CLOSE_TIMEOUT_MS), settleWithin(postgres.pool.end(), STORAGE_CLOSE_TIMEOUT_MS)]);
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
  log.info({ publicUrl: config.publicUrl }, 'Web runtime started');
  return deps;
}

/** The runtime of this process; 503 storage_unavailable before register() has finished. */
export function getRuntime(): WebDeps {
  const deps = processGlobal.__perryWeb;
  if (deps === undefined) throw new ApiError('storage_unavailable', { message: 'The web runtime is starting' });
  return deps;
}

/** Route Handler export for a handler factory: `export const GET = bind(getSession);`. */
export function bind(factory: HandlerFactory): Handler {
  let cached: { deps: WebDeps; handler: Handler } | null = null;
  return async (request, context) => {
    let deps: WebDeps;
    try {
      deps = getRuntime();
    } catch (err) {
      if (isApiError(err)) return errorResponse(err);
      throw err;
    }
    if (cached === null || cached.deps !== deps) cached = { deps, handler: factory(deps) };
    return cached.handler(request, context);
  };
}
