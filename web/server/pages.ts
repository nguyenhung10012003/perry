import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import type { GuildListItem, PublicLeaderboard } from '../shared/api.js';
import { SNOWFLAKE_RE } from '../shared/discord.js';
import { isLocale } from '../shared/i18n/index.js';
import type { Locale } from '../shared/i18n/index.js';
import { clientIp } from './client-ip.js';
import { cookieNames } from './cookies.js';
import type { WebDeps } from './deps.js';
import { isApiError } from './errors.js';
import { requireManageableGuild } from './guild-access.js';
import type { ManageableGuild } from './guild-access.js';
import { manageableGuilds } from './handlers/guilds.js';
import { inviteUrl } from './invite.js';
import { publicLeaderboard } from './leaderboard.js';
import { sanitizeReturnTo } from './oauth.js';
import { getRuntime } from './runtime.js';
import { readSession } from './session.js';
import type { Session } from './session.js';

/**
 * Loaders of the Server Component pages. They call the same server modules as the Route Handlers (pages never make
 * HTTP calls to their own API) and are wrapped in React's cache(), so a layout and a page of one request share one
 * session read and one guild check. Expected outages come back as typed values instead of thrown errors, so Next
 * logs no stack trace for them.
 */

export type UnavailableReason = 'storage' | 'schema' | 'bot' | 'discord';

export type PageFailure =
  | { kind: 'login' }
  | { kind: 'not_found' }
  | { kind: 'invite'; guildId: string; guildName: string; inviteUrl: string }
  | { kind: 'unavailable'; reason: UnavailableReason };

/** Maps an expected API failure to the page outcome; anything else is rethrown (a bug, shown by error.tsx). */
export function pageFailure(err: unknown, guildId?: string, deps?: WebDeps): PageFailure {
  if (!isApiError(err)) throw err;
  switch (err.code) {
    case 'unauthorized':
    case 'session_expired':
      return { kind: 'login' };
    case 'forbidden':
    case 'invalid_params':
    case 'not_found':
      return { kind: 'not_found' };
    case 'bot_not_in_guild':
      return {
        kind: 'invite',
        guildId: guildId ?? '',
        guildName: guildId ?? '',
        inviteUrl: err.options.inviteUrl ?? (deps !== undefined ? inviteUrl(deps.config.clientId, guildId) : ''),
      };
    case 'schema_outdated':
      return { kind: 'unavailable', reason: 'schema' };
    case 'bot_unavailable':
      return { kind: 'unavailable', reason: 'bot' };
    case 'discord_unavailable':
    case 'discord_rate_limited':
      return { kind: 'unavailable', reason: 'discord' };
    case 'storage_unavailable':
      return { kind: 'unavailable', reason: 'storage' };
    default:
      throw err;
  }
}

function runtimeOrNull(): WebDeps | null {
  try {
    return getRuntime();
  } catch {
    return null;
  }
}

/** The bot invite of the landing page (the client id comes from the web config). */
export function landingInviteUrl(): string {
  const clientId = runtimeOrNull()?.config.clientId ?? process.env.DISCORD_CLIENT_ID ?? '';
  return inviteUrl(clientId);
}

/** Locale computed by proxy.ts (?lang, cookie, Accept-Language, DEFAULT_LOCALE, en). */
export const loadLocale = cache(async (): Promise<Locale> => {
  const value = (await headers()).get('x-perry-locale');
  if (isLocale(value)) return value;
  return runtimeOrNull()?.config.defaultLocale ?? 'en';
});

/** The login link of the current page: /auth/login?returnTo=<sanitized path from proxy.ts>. */
export const loadLoginHref = cache(async (): Promise<string> => {
  const path = (await headers()).get('x-perry-path') ?? '/dashboard';
  return `/auth/login?returnTo=${encodeURIComponent(sanitizeReturnTo(path.split('?')[0]))}`;
});

export type PageSession = { ok: true; deps: WebDeps; session: Session } | PageFailure;

export const loadSession = cache(async (): Promise<PageSession> => {
  const deps = runtimeOrNull();
  if (deps === null) return { kind: 'unavailable', reason: 'storage' };
  const value = (await cookies()).get(cookieNames(deps.config.secureCookies).session)?.value;
  const read = await readSession(deps, value);
  if (read.ok) return { ok: true, deps, session: read.session };
  if (read.reason === 'unavailable') return { kind: 'unavailable', reason: 'storage' };
  return { kind: 'login' };
});

export type ServerList = { ok: true; guilds: GuildListItem[] } | PageFailure;

export const loadServerList = cache(async (): Promise<ServerList> => {
  const loaded = await loadSession();
  if (!('ok' in loaded)) return loaded;
  try {
    return { ok: true, guilds: await manageableGuilds(loaded.deps, loaded.session) };
  } catch (err) {
    return pageFailure(err, undefined, loaded.deps);
  }
});

export type GuildPage = { ok: true; deps: WebDeps; session: Session; access: ManageableGuild } | PageFailure;

/** The guild check of every dashboard/[guildId] page (layouts are not re-rendered on navigation, so pages call it). */
export const loadGuildPage = cache(async (guildId: string): Promise<GuildPage> => {
  if (!SNOWFLAKE_RE.test(guildId)) return { kind: 'not_found' };
  const loaded = await loadSession();
  if (!('ok' in loaded)) return loaded;
  try {
    const access = await requireManageableGuild(loaded.deps, loaded.session, guildId);
    return { ok: true, deps: loaded.deps, session: loaded.session, access };
  } catch (err) {
    const failure = pageFailure(err, guildId, loaded.deps);
    if (failure.kind !== 'invite') return failure;
    // The user's guild list is cached (60 s); it has the name the invite card shows.
    const guilds = await loaded.deps.guildData.userGuilds(loaded.session).catch(() => []);
    return { ...failure, guildName: guilds.find((guild) => guild.id === guildId)?.name ?? guildId };
  }
});

/** Runs a page's own data load with the same failure mapping. */
export async function loadPageData<T>(
  page: { deps: WebDeps; access: ManageableGuild },
  load: () => Promise<T>,
): Promise<{ ok: true; value: T } | PageFailure> {
  try {
    return { ok: true, value: await load() };
  } catch (err) {
    return pageFailure(err, page.access.guild.id, page.deps);
  }
}

export type PublicPage =
  | { ok: true; board: PublicLeaderboard }
  | { kind: 'not_found' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable'; reason: UnavailableReason };

/** Route 6 (DP-5 (b)): the web-public limit (a page cannot answer 429, so it shows a notice), then the shared loader. */
export const loadPublicLeaderboard = cache(async (guildId: string, page: number): Promise<PublicPage> => {
  if (!SNOWFLAKE_RE.test(guildId)) return { kind: 'not_found' };
  const deps = runtimeOrNull();
  if (deps === null) return { kind: 'unavailable', reason: 'storage' };
  const ip = clientIp(await headers(), deps.config.trustProxy);
  const limited = await deps.rateLimits.check('web-public', ip);
  if (!limited.ok) return { kind: 'rate_limited' };
  try {
    const board = await publicLeaderboard(deps, guildId, page);
    return board === null ? { kind: 'not_found' } : { ok: true, board };
  } catch (err) {
    const failure = pageFailure(err, guildId, deps);
    return failure.kind === 'unavailable' ? failure : { kind: 'not_found' };
  }
});
