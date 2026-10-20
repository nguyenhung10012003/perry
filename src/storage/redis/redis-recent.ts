import type { Redis } from 'ioredis';
import { RECENT_MAX_MEMBERS, RECENT_TTL_SECONDS } from '../../config/constants.js';
import type { BackendHealth } from '../health.js';
import type { Keys } from '../keys.js';
import type { MemoryRecentlyPlayedStore } from '../memory/memory-recent.js';
import type { RecentlyPlayedStore } from '../types.js';

/**
 * Recently played keys per guild as a ZSET (score = ms timestamp), trimmed to RECENT_MAX_MEMBERS and expiring
 * after RECENT_TTL_SECONDS. The in-process ring is always written and answers alone while Redis is down;
 * reads union both while Redis is up.
 */
export class RedisRecentlyPlayedStore implements RecentlyPlayedStore {
  constructor(
    private readonly client: Redis,
    private readonly health: BackendHealth,
    private readonly keysScheme: Keys,
    private readonly memory: MemoryRecentlyPlayedStore,
  ) {}

  async add(guildId: string, trackKeys: readonly string[]): Promise<void> {
    if (trackKeys.length === 0) return;
    await this.memory.add(guildId, trackKeys);
    const key = this.keysScheme.recent(guildId);
    const score = Date.now();
    const args = trackKeys.flatMap((member) => [score, member] as const);
    await this.health.attempt(async () => {
      const replies = await this.client
        .multi()
        .zadd(key, ...args)
        .zremrangebyrank(key, 0, -(RECENT_MAX_MEMBERS + 1))
        .expire(key, RECENT_TTL_SECONDS)
        .exec();
      const failed = replies?.find(([err]) => err !== null);
      if (failed?.[0]) throw failed[0];
    });
  }

  async keys(guildId: string): Promise<Set<string>> {
    const result = await this.memory.keys(guildId);
    const stored = await this.health.guard(() => this.client.zrange(this.keysScheme.recent(guildId), '0', '-1'), []);
    for (const member of stored) result.add(member);
    return result;
  }

  async clear(guildId: string): Promise<void> {
    await this.memory.clear(guildId);
    await this.health.attempt(() => this.client.del(this.keysScheme.recent(guildId)));
  }
}
