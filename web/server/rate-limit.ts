import 'server-only';
import { WEB_RATE_LIMITS } from '../../src/config/constants.js';
import type { RateLimiter } from '../../src/storage/types.js';

export type WebRateScope = keyof typeof WEB_RATE_LIMITS;

export type RateResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** The web's fixed-window limits (design 4.12) on the storage RateLimiter (Redis, in-process fallback when down). */
export interface WebRateLimits {
  check(scope: WebRateScope, id: string): Promise<RateResult>;
}

export function createWebRateLimits(limiter: RateLimiter): WebRateLimits {
  return {
    async check(scope, id) {
      const { max, windowSeconds } = WEB_RATE_LIMITS[scope];
      const allowed = await limiter.hit(scope, id, max, windowSeconds);
      return allowed ? { ok: true } : { ok: false, retryAfterSeconds: windowSeconds };
    },
  };
}
