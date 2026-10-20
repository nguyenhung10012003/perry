import type { Redis } from 'ioredis';
import type { BackendHealth } from '../health.js';
import type { KeyValueCache } from '../types.js';

/** JSON cache on Redis. Every write carries a TTL. Failures degrade to a miss / false and never throw. */
export class RedisKeyValueCache implements KeyValueCache {
  constructor(
    private readonly client: Redis,
    private readonly health: BackendHealth,
  ) {}

  async getJson(key: string): Promise<unknown> {
    const raw = await this.health.guard(() => this.client.get(key), null);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    const result = await this.health.attempt(() => this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds));
    return result.ok;
  }

  async del(key: string): Promise<boolean> {
    const result = await this.health.attempt(() => this.client.del(key));
    return result.ok;
  }
}
