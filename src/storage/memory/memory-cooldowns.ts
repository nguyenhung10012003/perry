import { Cooldowns } from '../../interactions/cooldowns.js';
import type { CooldownStore, RateLimiter } from '../types.js';

const SWEEP_THRESHOLD = 1000;

/** In-process cooldowns (memory driver, and the fallback while Redis is down). */
export class MemoryCooldownStore implements CooldownStore {
  private readonly cooldowns = new Cooldowns();

  check(name: string, userId: string, seconds: number): Promise<number> {
    return Promise.resolve(this.cooldowns.check(name, userId, seconds));
  }
}

/** Fixed window counters kept in memory (memory driver, and the fallback while Redis is down). */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  hit(scope: string, id: string, max: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    if (this.windows.size > SWEEP_THRESHOLD) {
      for (const [key, window] of this.windows) {
        if (window.resetAt <= now) this.windows.delete(key);
      }
    }
    const key = `${scope}:${id}`;
    let window = this.windows.get(key);
    if (window === undefined || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowSeconds * 1000 };
      this.windows.set(key, window);
    }
    window.count += 1;
    return Promise.resolve(window.count <= max);
  }
}
