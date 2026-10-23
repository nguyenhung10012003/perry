import 'server-only';
import { z } from 'zod';
import type { Keys } from '../../src/storage/keys.js';
import type { Result } from '../../src/storage/types.js';
import { cookieNames, parseCookies } from './cookies.js';
import { open, randomToken, sha256hex, TOKEN_RE } from './crypto.js';
import type { WebDeps } from './deps.js';
import { ApiError } from './errors.js';
import type { RawCache } from './raw-cache.js';

/** Session record in Redis at web:sess:<sha256(session id)>; the Discord token is sealed (AES-256-GCM). */
export const sessionRecordSchema = z.object({
  v: z.literal(1),
  userId: z.string().regex(/^\d{17,20}$/),
  username: z.string(),
  globalName: z.string().nullable(),
  avatar: z.string().nullable(),
  accessToken: z.string().startsWith('v1.'),
  tokenExpiresAt: z.number(),
  csrfToken: z.string().regex(TOKEN_RE),
  createdAt: z.number(),
});
export type SessionRecord = z.infer<typeof sessionRecordSchema>;

export interface SessionStore {
  /** { ok: false } while Redis is unavailable; null when there is no such session. */
  get(sessionId: string): Promise<Result<unknown>>;
  /** Stores a new session under a fresh id and returns the id; null when Redis could not store it. */
  create(record: SessionRecord, ttlSeconds: number): Promise<string | null>;
  delete(sessionId: string): Promise<void>;
}

export function createSessionStore(cache: RawCache, keys: Keys): SessionStore {
  const key = (sessionId: string) => keys.webSession(sha256hex(sessionId));
  return {
    async get(sessionId) {
      const raw = await cache.get(key(sessionId));
      if (!raw.ok) return raw;
      if (raw.value === null) return { ok: true, value: null };
      try {
        return { ok: true, value: JSON.parse(raw.value) as unknown };
      } catch {
        return { ok: true, value: {} };
      }
    },
    async create(record, ttlSeconds) {
      // A fresh id on every login: session fixation is impossible.
      const sessionId = randomToken();
      const stored = await cache.set(key(sessionId), JSON.stringify(record), ttlSeconds);
      return stored ? sessionId : null;
    },
    async delete(sessionId) {
      await cache.del(key(sessionId));
    },
  };
}

/** A valid session of the current request. accessToken is the opened Discord token; it is never logged. */
export interface Session {
  readonly id: string;
  readonly record: SessionRecord;
  readonly accessToken: string;
}

export type SessionRead = { ok: true; session: Session } | { ok: false; reason: 'none' | 'expired' | 'unavailable' };

/** Reads and checks the session of a cookie value. A record that cannot be parsed or opened is deleted. */
export async function readSession(deps: WebDeps, sessionId: string | undefined): Promise<SessionRead> {
  if (sessionId === undefined || !TOKEN_RE.test(sessionId)) return { ok: false, reason: 'none' };
  const stored = await deps.sessions.get(sessionId);
  if (!stored.ok) return { ok: false, reason: 'unavailable' };
  if (stored.value === null) return { ok: false, reason: 'none' };
  const parsed = sessionRecordSchema.safeParse(stored.value);
  if (!parsed.success) {
    await deps.sessions.delete(sessionId);
    return { ok: false, reason: 'none' };
  }
  const record = parsed.data;
  if (record.tokenExpiresAt <= deps.now()) {
    await deps.sessions.delete(sessionId);
    return { ok: false, reason: 'expired' };
  }
  const accessToken = open(deps.sealKey, record.accessToken);
  if (accessToken === null) {
    // Rotated SESSION_SECRET or a tampered record.
    await deps.sessions.delete(sessionId);
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, session: { id: sessionId, record, accessToken } };
}

export function sessionCookieValue(deps: WebDeps, cookieHeader: string | null): string | undefined {
  return parseCookies(cookieHeader).get(cookieNames(deps.config.secureCookies).session);
}

/** The session of an API request: 401 unauthorized / session_expired, 503 storage_unavailable. */
export async function requireSession(deps: WebDeps, request: Request): Promise<Session> {
  const read = await readSession(deps, sessionCookieValue(deps, request.headers.get('cookie')));
  if (read.ok) return read.session;
  if (read.reason === 'unavailable') throw new ApiError('storage_unavailable');
  throw new ApiError(read.reason === 'expired' ? 'session_expired' : 'unauthorized');
}
