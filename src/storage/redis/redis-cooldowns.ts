import type { Redis } from 'ioredis';
import type { BackendHealth } from '../health.js';
import type { Keys } from '../keys.js';
import { MemoryCooldownStore, MemoryRateLimiter } from '../memory/memory-cooldowns.js';
import type { CooldownStore, RateLimiter } from '../types.js';

/**
 * Cross-process cooldowns: `SET key 1 NX EX seconds`; when the key exists the remaining time comes from PTTL.
 * While Redis is unreachable the in-process Cooldowns class enforces the cooldown instead.
 */
export class RedisCooldownStore implements CooldownStore {
  private readonly fallback = new MemoryCooldownStore();

  constructor(
    private readonly client: Redis,
    private readonly health: BackendHealth,
    private readonly keys: Keys,
  ) {}

  async check(name: string, userId: string, seconds: number): Promise<number> {
    if (seconds <= 0) return 0;
    const key = this.keys.cooldown(name, userId);
    const ttl = Math.ceil(seconds);
    const result = await this.health.attempt(async () => {
      if ((await this.client.set(key, '1', 'EX', ttl, 'NX')) === 'OK') return 0;
      const pttl = await this.client.pttl(key);
      if (pttl > 0) return Math.ceil(pttl / 1000);
      // The key expired between SET and PTTL (-2) or lost its TTL (-1): (re)start the cooldown now.
      await this.client.set(key, '1', 'EX', ttl);
      return pttl === -2 ? 0 : ttl;
    });
    return result.ok ? result.value : this.fallback.check(name, userId, seconds);
  }
}

/** Fixed-window counters: `MULTI SET key 0 EX window NX; INCR key`. Falls back to in-process counters. */
export class RedisRateLimiter implements RateLimiter {
  private readonly fallback = new MemoryRateLimiter();

  constructor(
    private readonly client: Redis,
    private readonly health: BackendHealth,
    private readonly keys: Keys,
  ) {}

  async hit(scope: string, id: string, max: number, windowSeconds: number): Promise<boolean> {
    const key = this.keys.rate(scope, id);
    const result = await this.health.attempt(async () => {
      const replies = await this.client
        .multi()
        .set(key, '0', 'EX', Math.max(1, Math.ceil(windowSeconds)), 'NX')
        .incr(key)
        .exec();
      const incr = replies?.[1];
      if (!incr || incr[0] !== null) throw incr?.[0] ?? new Error('Rate limit transaction aborted');
      return Number(incr[1]);
    });
    return result.ok ? result.value <= max : this.fallback.hit(scope, id, max, windowSeconds);
  }
}
