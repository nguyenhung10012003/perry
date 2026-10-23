import 'server-only';
import { WEB_OAUTH_STATE_TTL_SECONDS, WEB_SESSION_MAX_TTL_SECONDS } from '../../../src/config/constants.js';
import { logoutBodySchema } from '../../shared/api.js';
import { getWebMessages, negotiateLocale } from '../../shared/i18n/index.js';
import type { Locale } from '../../shared/i18n/index.js';
import { clearCookie, cookieNames, parseCookies, serializeCookie } from '../cookies.js';
import { randomToken, seal, TOKEN_RE, timingSafeEqualStr } from '../crypto.js';
import type { WebDeps } from '../deps.js';
import type { DiscordUser, OAuthToken } from '../discord-api.js';
import { ApiError, isApiError } from '../errors.js';
import { apiRoute } from '../handler.js';
import { AUTH_PAGE_CSP, plainPage } from '../html.js';
import { authorizeUrl, sanitizeReturnTo } from '../oauth.js';

/**
 * Discord OAuth2 authorization code flow (design 4.11, routes 2-4). Redirects are `new Response(null, 302)` with each
 * cookie in its own Set-Cookie header; the callback's error pages are small escaped HTML pages with their own CSP.
 */

const CODE_RE = /^[A-Za-z0-9._~-]{1,512}$/;
const DISCORD_ISSUER = 'https://discord.com';

function locale(deps: WebDeps, request: Request): Locale {
  const cookies = parseCookies(request.headers.get('cookie'));
  return negotiateLocale({
    cookie: cookies.get(cookieNames(deps.config.secureCookies).lang),
    acceptLanguage: request.headers.get('accept-language'),
    defaultLocale: deps.config.defaultLocale,
  });
}

type AuthPage = 'expired' | 'invalid' | 'discord' | 'unavailable' | 'rateLimited';

const PAGE_STATUS: Record<AuthPage, number> = { expired: 400, invalid: 400, discord: 502, unavailable: 503, rateLimited: 429 };

function page(deps: WebDeps, request: Request, kind: AuthPage, setCookies: string[] = [], retryAfter?: number): Response {
  const lang = locale(deps, request);
  const t = getWebMessages(lang).auth;
  const titles: Record<AuthPage, [string, string]> = {
    expired: [t.expiredTitle, t.expiredBody],
    invalid: [t.invalidTitle, t.invalidBody],
    discord: [t.discordTitle, t.discordBody],
    unavailable: [t.unavailableTitle, t.unavailableBody],
    rateLimited: [t.rateLimitedTitle, t.rateLimitedBody],
  };
  const [title, body] = titles[kind];
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': AUTH_PAGE_CSP,
  });
  for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
  if (retryAfter !== undefined) headers.set('Retry-After', String(retryAfter));
  const html = plainPage({
    lang,
    title,
    body,
    linkHref: '/auth/login',
    linkText: t.tryAgain,
    secondaryHref: '/',
    secondaryText: t.backHome,
  });
  return new Response(html, { status: PAGE_STATUS[kind], headers });
}

/** Thrown failures of the auth routes as HTML pages (rate limit, Redis down, bugs). */
function renderAuthError(deps: WebDeps, request: Request, err: ApiError, setCookies: string[] = []): Response {
  if (err.code === 'rate_limited') return page(deps, request, 'rateLimited', setCookies, err.options.retryAfter);
  if (err.code === 'storage_unavailable') return page(deps, request, 'unavailable', setCookies);
  return page(deps, request, 'unavailable', setCookies);
}

function redirect(location: string, setCookies: string[]): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function oauthCookieFlags(deps: WebDeps) {
  return { httpOnly: true, secure: deps.config.secureCookies };
}

/** Route 2: GET /auth/login?returnTo=... -> 302 to Discord with a state bound to this browser by a cookie. */
export const login = apiRoute({ route: '/auth/login', auth: 'public', ipLimit: 'web-auth', renderError: renderAuthError }, async ({ deps, request }) => {
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get('returnTo'));
  const state = randomToken();
  const stored = await deps.oauthStates.put(state, { returnTo, createdAt: deps.now() });
  if (!stored) throw new ApiError('storage_unavailable');
  const names = cookieNames(deps.config.secureCookies);
  const cookie = serializeCookie(names.oauth, state, { ...oauthCookieFlags(deps), maxAge: WEB_OAUTH_STATE_TTL_SECONDS });
  return redirect(authorizeUrl(deps.config, state), [cookie]);
});

/** Route 3: GET /auth/callback?code&state[&error][&iss]. The state cookie is cleared in every outcome. */
export const callback = apiRoute(
  {
    route: '/auth/callback',
    auth: 'public',
    ipLimit: 'web-auth',
    renderError: (deps, request, err) =>
      renderAuthError(deps, request, err, [clearCookie(cookieNames(deps.config.secureCookies).oauth, oauthCookieFlags(deps))]),
  },
  async ({ deps, request }) => {
    const names = cookieNames(deps.config.secureCookies);
    const clearState = clearCookie(names.oauth, oauthCookieFlags(deps));
    const search = new URL(request.url).searchParams;
    if (search.has('error')) return redirect(`${deps.config.publicUrl}/?login=cancelled`, [clearState]);

    const state = search.get('state') ?? '';
    const cookieState = parseCookies(request.headers.get('cookie')).get(names.oauth) ?? '';
    if (!TOKEN_RE.test(state) || !timingSafeEqualStr(state, cookieState)) {
      deps.logger.warn({ reason: state === '' ? 'missing' : 'mismatch' }, 'OAuth state check failed');
      return page(deps, request, 'expired', [clearState]);
    }
    const taken = await deps.oauthStates.take(state);
    if (!taken.ok) return page(deps, request, 'unavailable', [clearState]);
    if (taken.value === null) {
      deps.logger.warn({ reason: 'unknown, used or expired' }, 'OAuth state check failed');
      return page(deps, request, 'expired', [clearState]);
    }
    const iss = search.get('iss');
    if (iss !== null && iss !== DISCORD_ISSUER) {
      deps.logger.warn({ reason: 'issuer' }, 'OAuth callback rejected');
      return page(deps, request, 'invalid', [clearState]);
    }
    const code = search.get('code') ?? '';
    if (!CODE_RE.test(code)) {
      deps.logger.warn({ reason: 'code' }, 'OAuth callback rejected');
      return page(deps, request, 'invalid', [clearState]);
    }

    let token: OAuthToken;
    let user: DiscordUser;
    try {
      token = await deps.discord.exchangeCode(code);
      if (!token.scopes.includes('identify') || !token.scopes.includes('guilds')) {
        deps.logger.warn({ reason: 'scope' }, 'OAuth token lacks the requested scopes');
        return page(deps, request, 'discord', [clearState]);
      }
      user = await deps.discord.getCurrentUser(token.accessToken);
    } catch (err) {
      // Duck-typed: the Discord client was built by another bundle (see isApiError).
      const status = isApiError(err) ? err.status : ((err as { status?: unknown } | null)?.status ?? null);
      deps.logger.warn({ status }, 'OAuth token exchange or user lookup failed');
      return page(deps, request, 'discord', [clearState]);
    }

    const now = deps.now();
    const ttl = Math.min(token.expiresIn, WEB_SESSION_MAX_TTL_SECONDS);
    const sessionId = await deps.sessions.create(
      {
        v: 1,
        userId: user.id,
        username: user.username,
        globalName: user.globalName,
        avatar: user.avatar,
        accessToken: seal(deps.sealKey, token.accessToken),
        tokenExpiresAt: now + token.expiresIn * 1000,
        csrfToken: randomToken(),
        createdAt: now,
      },
      ttl,
    );
    if (sessionId === null) return page(deps, request, 'unavailable', [clearState]);
    const sessionCookie = serializeCookie(names.session, sessionId, { httpOnly: true, secure: deps.config.secureCookies, maxAge: ttl });
    deps.logger.info({ userId: user.id }, 'User logged in');
    return redirect(`${deps.config.publicUrl}${sanitizeReturnTo(taken.value.returnTo)}`, [clearState, sessionCookie]);
  },
);

/** Route 4: POST /auth/logout (session + CSRF; no body, or {}). Deletes the session and revokes the Discord token. */
export const logout = apiRoute(
  { route: '/auth/logout', auth: 'session', body: logoutBodySchema, optionalBody: true },
  async ({ deps, session }) => {
    await deps.sessions.delete(session.id);
    void deps.discord.revokeToken(session.accessToken);
    const names = cookieNames(deps.config.secureCookies);
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', clearCookie(names.session, { httpOnly: true, secure: deps.config.secureCookies }));
    return new Response(null, { status: 204, headers });
  },
);
