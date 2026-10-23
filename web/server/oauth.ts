import 'server-only';
import { z } from 'zod';
import { WEB_OAUTH_STATE_TTL_SECONDS } from '../../src/config/constants.js';
import type { Keys } from '../../src/storage/keys.js';
import type { Result } from '../../src/storage/types.js';
import type { WebConfig } from './config.js';
import type { RawCache } from './raw-cache.js';

const stateRecordSchema = z.object({ returnTo: z.string(), createdAt: z.number() });
export type OAuthStateRecord = z.infer<typeof stateRecordSchema>;

/** OAuth states: SET web:oauth:<state> EX 600 on login, GETDEL on callback (single use). */
export interface OAuthStateStore {
  put(state: string, record: OAuthStateRecord): Promise<boolean>;
  /** The record (deleted by the read), null when unknown, used or expired; { ok: false } while Redis is down. */
  take(state: string): Promise<Result<OAuthStateRecord | null>>;
}

export function createOAuthStateStore(cache: RawCache, keys: Keys): OAuthStateStore {
  return {
    put: (state, record) => cache.set(keys.webOAuthState(state), JSON.stringify(record), WEB_OAUTH_STATE_TTL_SECONDS),
    async take(state) {
      const raw = await cache.getDel(keys.webOAuthState(state));
      if (!raw.ok) return raw;
      if (raw.value === null) return { ok: true, value: null };
      try {
        const parsed = stateRecordSchema.safeParse(JSON.parse(raw.value));
        return { ok: true, value: parsed.success ? parsed.data : null };
      } catch {
        return { ok: true, value: null };
      }
    },
  };
}

const RETURN_TO_RE = /^\/(dashboard|leaderboard)(\/[A-Za-z0-9_/-]{0,180})?$/;
export const DEFAULT_RETURN_TO = '/dashboard';

/** Only dashboard and leaderboard paths of this site (no open redirects); anything else becomes /dashboard. */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (typeof value !== 'string' || !RETURN_TO_RE.test(value) || value.includes('//')) return DEFAULT_RETURN_TO;
  return value;
}

/** Discord's authorize URL for the authorization code flow with scopes identify and guilds. */
export function authorizeUrl(config: WebConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    scope: 'identify guilds',
    redirect_uri: config.redirectUri,
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString().replace(/\+/g, '%20')}`;
}
