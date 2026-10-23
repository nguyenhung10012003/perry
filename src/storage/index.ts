import {
  STORAGE_CLOSE_TIMEOUT_MS,
  STORAGE_STARTUP_TIMEOUT_MS,
} from '../config/constants.js';
import type { Config } from '../config/env.js';
import { PersistentGuildSettingsStore } from '../settings/persistent-store.js';
import { InMemoryGuildSettingsStore } from '../settings/memory-store.js';
import { safeError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';
import { childLogger } from '../utils/logger.js';
import { settleWithin, withTimeout } from '../utils/timeout.js';
import { BackendHealth } from './health.js';
import { createKeys } from './keys.js';
import type { Keys } from './keys.js';
import { MemoryKeyValueCache } from './memory/memory-cache.js';
import { MemoryCaseStore } from './memory/memory-cases.js';
import { MemoryCooldownStore, MemoryRateLimiter } from './memory/memory-cooldowns.js';
import { MemoryLevelStore } from './memory/memory-levels.js';
import { MemoryRecentlyPlayedStore } from './memory/memory-recent.js';
import { NullSnapshotStore } from './memory/null-snapshots.js';
import { PostgresCaseStore } from './postgres/case-repo.js';
import { createPostgres, ensureSchema, SCHEMA_PROBE } from './postgres/client.js';
import { recordPlay } from './postgres/history-repo.js';
import type { PlayHistoryEntry } from './postgres/history-repo.js';
import { PostgresLevelStore } from './postgres/level-repo.js';
import { createRedis } from './redis/client.js';
import { createChannelSubscriber, createSettingsInvalidation } from './redis/pubsub.js';
import type { ChannelSubscription, SettingsInvalidation } from './redis/pubsub.js';
import { RedisKeyValueCache } from './redis/redis-cache.js';
import { RedisCooldownStore, RedisRateLimiter } from './redis/redis-cooldowns.js';
import { RedisRecentlyPlayedStore } from './redis/redis-recent.js';
import { RedisSnapshotStore } from './redis/redis-snapshots.js';
import type { HistoryStore, Storage } from './types.js';

export type { Storage } from './types.js';

const noopHistory: HistoryStore = { record: () => undefined };

function createMemoryStorage(keys: Keys): Storage {
  const recent = new MemoryRecentlyPlayedStore();
  return {
    driver: 'memory',
    settings: new InMemoryGuildSettingsStore(),
    cooldowns: new MemoryCooldownStore(),
    limiter: new MemoryRateLimiter(),
    cache: new MemoryKeyValueCache(),
    recent,
    snapshots: new NullSnapshotStore(),
    history: noopHistory,
    cases: new MemoryCaseStore(),
    levels: new MemoryLevelStore(),
    health: { postgres: null, redis: null },
    keys,
    purgeGuild(guildId): Promise<void> {
      return recent.clear(guildId);
    },
    subscribe: () => null,
    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

/**
 * Builds the storage layer. NEVER throws: when Postgres or Redis cannot be reached within the startup budget
 * the bot starts degraded (in-process fallbacks) and the backends reconnect in the background. If a client cannot
 * even be constructed (e.g. an unusable connection string) it falls back to the in-memory storage.
 */
export async function createStorage(config: Config, logger: Logger): Promise<Storage> {
  try {
    return await createConfiguredStorage(config, logger);
  } catch (err) {
    const log = childLogger(logger, 'storage');
    log.error({ err: safeError(err) }, 'Could not create the Postgres/Redis clients, using in-memory storage');
    return createMemoryStorage(createKeys(config.storage.keyPrefix));
  }
}

async function createConfiguredStorage(config: Config, logger: Logger): Promise<Storage> {
  const { storage } = config;
  const log = childLogger(logger, 'storage');
  const keys = createKeys(storage.keyPrefix);
  if (storage.driver === 'memory' || storage.databaseUrl === undefined || storage.redisUrl === undefined) {
    log.info('Using in-memory storage: settings are not persisted');
    return createMemoryStorage(keys);
  }

  const postgres = createPostgres(storage.databaseUrl, log);
  const redis = createRedis(storage.redisUrl, log);
  const { db } = postgres;

  const pgHealth = new BackendHealth({
    name: 'Postgres',
    logger: log,
    // Probes the schema too (the newest column of every table), so a database without current migrations stays
    // "down" until `npm run db:migrate` was run.
    probe: async () => {
      await db.execute(SCHEMA_PROBE);
    },
  });
  const redisHealth = redis.health;

  const startPostgres = async (): Promise<void> => {
    try {
      const schemaReady = await withTimeout(ensureSchema(db, log), STORAGE_STARTUP_TIMEOUT_MS);
      if (schemaReady) pgHealth.markUp();
      else pgHealth.markDown(new Error('Database schema is missing or outdated'), true);
    } catch (err) {
      pgHealth.markDown(err);
    }
  };
  const startRedis = async (): Promise<void> => {
    const ready = await redis.waitReady(STORAGE_STARTUP_TIMEOUT_MS);
    if (!ready) redisHealth.markDown(new Error(`Not reachable within ${STORAGE_STARTUP_TIMEOUT_MS} ms`));
  };
  await Promise.all([startPostgres(), startRedis()]);

  const cache = new RedisKeyValueCache(redis.client, redisHealth);
  const recent = new RedisRecentlyPlayedStore(redis.client, redisHealth, keys, new MemoryRecentlyPlayedStore());

  let invalidation: SettingsInvalidation | undefined;
  const settings = new PersistentGuildSettingsStore({
    db,
    postgres: pgHealth,
    cache,
    redis: redisHealth,
    keys,
    publishInvalidation: (guildId) => invalidation?.publish(guildId),
  });
  if (storage.pubsubInvalidation) {
    invalidation = createSettingsInvalidation(redis.client, redisHealth, keys.settingsEvents(), log, (guildId) => {
      settings.invalidateLocal(guildId);
    });
  }

  const history: HistoryStore = storage.playHistory
    ? {
        record(entry: PlayHistoryEntry): void {
          void pgHealth.attempt(() => recordPlay(db, entry));
        },
      }
    : noopHistory;

  const snapshots = new RedisSnapshotStore(redis.client, redisHealth, keys);
  const subscriptions = new Set<ChannelSubscription>();

  let closed = false;
  return {
    driver: 'persistent',
    settings,
    cooldowns: new RedisCooldownStore(redis.client, redisHealth, keys),
    limiter: new RedisRateLimiter(redis.client, redisHealth, keys),
    cache,
    recent,
    snapshots,
    history,
    cases: new PostgresCaseStore(db, pgHealth),
    levels: new PostgresLevelStore(db, pgHealth),
    health: { postgres: pgHealth, redis: redisHealth },
    keys,
    async purgeGuild(guildId) {
      try {
        await Promise.all([recent.clear(guildId), snapshots.delete(guildId)]);
      } catch (err) {
        log.warn({ err: safeError(err), guildId }, 'Could not purge guild data');
      }
    },
    subscribe(channel, onMessage) {
      const subscription = createChannelSubscriber(redis.client, channel, log, onMessage);
      const handle = {
        close(): void {
          if (!subscriptions.delete(handle)) return;
          subscription.close();
        },
      };
      subscriptions.add(handle);
      return handle;
    },
    async close() {
      if (closed) return;
      closed = true;
      pgHealth.stop();
      invalidation?.close();
      for (const subscription of [...subscriptions]) subscription.close();
      await Promise.all([
        redis.close(STORAGE_CLOSE_TIMEOUT_MS),
        settleWithin(postgres.pool.end(), STORAGE_CLOSE_TIMEOUT_MS),
      ]);
    },
  };
}
