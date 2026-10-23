import 'server-only';
import { WEB_PUBLIC_LEADERBOARD_PAGE_MAX, WEB_PUBLIC_LEADERBOARD_TTL_SECONDS, WEB_SETTINGS_REDEL_DELAY_MS } from '../../src/config/constants.js';
import { defaultSettings, validateSettingsPatch } from '../../src/settings/guild-settings.js';
import type { BackendHealth } from '../../src/storage/health.js';
import type { Keys } from '../../src/storage/keys.js';
import type { Database } from '../../src/storage/postgres/client.js';
import {
  countMembers,
  leaderboardPage,
  listRewards,
  replaceRewards,
} from '../../src/storage/postgres/level-repo.js';
import { getSettings, upsertSettings } from '../../src/storage/postgres/settings-repo.js';
import type { SettingsPublisher } from '../../src/storage/redis/pubsub.js';
import type { Logger } from '../../src/utils/logger.js';
import type { PublicLeaderboard } from '../shared/api.js';
import type { LevelsGateway, PublicLeaderboardCache, SettingsGateway } from './deps.js';
import { ApiError } from './errors.js';
import type { RawCache } from './raw-cache.js';

export interface PostgresGatewayDeps {
  readonly db: Database;
  readonly pg: BackendHealth;
  /** True while the start-up probe found an outdated schema (503 schema_outdated instead of storage_unavailable). */
  readonly schemaOutdated: () => boolean;
}

function unavailable(deps: PostgresGatewayDeps): ApiError {
  return new ApiError(deps.schemaOutdated() ? 'schema_outdated' : 'storage_unavailable');
}

async function attempt<T>(deps: PostgresGatewayDeps, op: () => Promise<T>): Promise<T> {
  const result = await deps.pg.attempt(op);
  if (!result.ok) throw unavailable(deps);
  return result.value;
}

export interface WriterDeps extends PostgresGatewayDeps {
  readonly cache: RawCache;
  /** Health of the web's Redis connection; its recovery drains the pending invalidations. */
  readonly redis: BackendHealth;
  readonly keys: Keys;
  readonly publisher: SettingsPublisher;
  readonly logger: Logger;
}

/**
 * Settings for the web (design 4.15, DP-6 (a)). A write upserts the patched columns (so another writer's fields are
 * never overwritten), then deletes the bot's Redis settings key and publishes an invalidation, and repeats both
 * 3 s later: a bot read that started before the write could otherwise re-cache the old row (design R3). A failed
 * DEL is remembered and retried when Redis recovers. The web never queues a write: Postgres down answers 503.
 */
export function createSettingsGateway(deps: WriterDeps): SettingsGateway {
  const pendingInvalidations = new Set<string>();

  const invalidate = async (guildId: string): Promise<void> => {
    const deleted = await deps.cache.del(deps.keys.settings(guildId));
    if (deleted) pendingInvalidations.delete(guildId);
    else pendingInvalidations.add(guildId);
    deps.publisher.publish(guildId);
  };

  deps.redis.onRecover(async () => {
    for (const guildId of [...pendingInvalidations]) {
      if (!(await deps.cache.del(deps.keys.settings(guildId)))) return;
      pendingInvalidations.delete(guildId);
      deps.publisher.publish(guildId);
    }
  });

  return {
    async read(guildId) {
      const stored = await attempt(deps, () => getSettings(deps.db, guildId));
      return stored ?? defaultSettings();
    },
    async write(guildId, patch) {
      // Domain rules; a RangeError here is a bug (zod and the semantic checks ran first) and becomes a 500.
      validateSettingsPatch(patch);
      const written = await attempt(deps, () => upsertSettings(deps.db, guildId, patch));
      await invalidate(guildId);
      setTimeout(() => {
        void invalidate(guildId).catch((err: unknown) => {
          deps.logger.debug({ err: String(err), guildId }, 'Delayed settings invalidation failed');
        });
      }, WEB_SETTINGS_REDEL_DELAY_MS).unref();
      return written;
    },
  };
}

export function createLevelsGateway(deps: PostgresGatewayDeps): LevelsGateway {
  return {
    rewards: (guildId) => attempt(deps, () => listRewards(deps.db, guildId)),
    replaceRewards: (guildId, rewards) => attempt(deps, () => replaceRewards(deps.db, guildId, rewards)),
    count: (guildId) => attempt(deps, () => countMembers(deps.db, guildId)),
    page: (guildId, offset, limit) => attempt(deps, () => leaderboardPage(deps.db, guildId, offset, limit)),
  };
}

export function createPublicLeaderboardCache(cache: RawCache, keys: Keys): PublicLeaderboardCache {
  return {
    async get(guildId, page) {
      const raw = await cache.get(keys.webPublicLeaderboard(guildId, page));
      if (!raw.ok || raw.value === null) return null;
      try {
        return JSON.parse(raw.value) as PublicLeaderboard;
      } catch {
        return null;
      }
    },
    async set(guildId, page, value) {
      await cache.set(keys.webPublicLeaderboard(guildId, page), JSON.stringify(value), WEB_PUBLIC_LEADERBOARD_TTL_SECONDS);
    },
    async clear(guildId) {
      const pages = Array.from({ length: WEB_PUBLIC_LEADERBOARD_PAGE_MAX }, (_, index) =>
        keys.webPublicLeaderboard(guildId, index + 1),
      );
      await cache.del(...pages);
    },
  };
}
