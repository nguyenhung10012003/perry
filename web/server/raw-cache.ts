import 'server-only';
import type { Redis } from 'ioredis';
import type { BackendHealth } from '../../src/storage/health.js';
import type { Result } from '../../src/storage/types.js';

/**
 * Raw Redis access for the web. Unlike KeyValueCache.getJson, get() tells a miss ({ ok: true, value: null }) from an
 * outage ({ ok: false }), which the session read and the bridge need. Every write carries a TTL. Never rejects.
 */
export interface RawCache {
  get(key: string): Promise<Result<string | null>>;
  /** GET and DEL in one command (single-use OAuth states). */
  getDel(key: string): Promise<Result<string | null>>;
  set(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** True when the keys are gone (or never existed); false when Redis could not be reached. */
  del(...keys: string[]): Promise<boolean>;
  /** Number of subscribers that received the message. */
  publish(channel: string, message: string): Promise<Result<number>>;
}

export function createRedisRawCache(client: Redis, health: BackendHealth): RawCache {
  return {
    get: (key) => health.attempt(() => client.get(key)),
    getDel: (key) => health.attempt(() => client.getdel(key)),
    async set(key, value, ttlSeconds) {
      const result = await health.attempt(() => client.set(key, value, 'EX', Math.max(1, Math.ceil(ttlSeconds))));
      return result.ok;
    },
    async del(...keys) {
      if (keys.length === 0) return true;
      const result = await health.attempt(() => client.del(...keys));
      return result.ok;
    },
    publish: (channel, message) => health.attempt(() => client.publish(channel, message)),
  };
}

/** In-process RawCache with TTLs (tests). */
export class MemoryRawCache implements RawCache {
  readonly entries = new Map<string, { value: string; expiresAt: number }>();
  readonly published: { channel: string; message: string }[] = [];
  up = true;
  subscribers = 0;

  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string): string | null {
    const entry = this.entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  get(key: string): Promise<Result<string | null>> {
    return Promise.resolve(this.up ? { ok: true, value: this.live(key) } : { ok: false });
  }

  getDel(key: string): Promise<Result<string | null>> {
    if (!this.up) return Promise.resolve({ ok: false });
    const value = this.live(key);
    this.entries.delete(key);
    return Promise.resolve({ ok: true, value });
  }

  set(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.up) return Promise.resolve(false);
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return Promise.resolve(true);
  }

  del(...keys: string[]): Promise<boolean> {
    if (!this.up) return Promise.resolve(false);
    for (const key of keys) this.entries.delete(key);
    return Promise.resolve(true);
  }

  publish(channel: string, message: string): Promise<Result<number>> {
    if (!this.up) return Promise.resolve({ ok: false });
    this.published.push({ channel, message });
    return Promise.resolve({ ok: true, value: this.subscribers });
  }
}
