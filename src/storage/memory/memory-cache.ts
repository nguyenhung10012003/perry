import type { KeyValueCache } from '../types.js';

const MAX_ENTRIES = 500;

/** Bounded in-process JSON cache with TTL; used when Redis is not configured. */
export class MemoryKeyValueCache implements KeyValueCache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();

  getJson(key: string): Promise<unknown> {
    const entry = this.entries.get(key);
    if (entry === undefined) return Promise.resolve(undefined);
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value);
  }

  setJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    return Promise.resolve(true);
  }

  del(key: string): Promise<boolean> {
    this.entries.delete(key);
    return Promise.resolve(true);
  }
}
