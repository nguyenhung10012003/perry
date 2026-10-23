import 'server-only';
import { z } from 'zod';
import { WEB_DISCORD_TIMEOUT_MS } from '../../src/config/constants.js';
import type { Logger } from '../../src/utils/logger.js';
import type { WebConfig } from './config.js';
import { ApiError } from './errors.js';

/**
 * Discord REST calls of the web: OAuth2 with the client credentials and the user's own token. The web never calls
 * Discord with the bot token (DP-10 (b)); guild data comes from the bot over the Redis bridge.
 */

const API = 'https://discord.com/api/v10';
const snowflake = z.string().regex(/^\d{17,20}$/);

const tokenSchema = z.object({
  access_token: z.string().min(1).max(512),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive(),
  scope: z.string(),
});
const userSchema = z.object({
  id: snowflake,
  username: z.string().min(1).max(64),
  global_name: z.string().max(64).nullable().optional(),
  avatar: z.string().nullable(),
});
const guildsSchema = z
  .array(
    z.object({
      id: snowflake,
      name: z.string().min(1).max(100),
      icon: z.string().nullable(),
      owner: z.boolean(),
      permissions: z.string().regex(/^\d{1,30}$/),
    }),
  )
  .max(200);

export interface OAuthToken {
  accessToken: string;
  expiresIn: number;
  scopes: string[];
}

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export interface UserGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  /** Decimal bitfield string. */
  permissions: string;
}

export const userGuildsSchema = guildsSchema;

/** Thrown by exchangeCode when Discord refuses the code or does not answer (the callback answers 502). */
export class OAuthExchangeError extends Error {
  constructor(readonly status: number | null) {
    super(`OAuth token exchange failed${status === null ? '' : ` with HTTP ${status}`}`);
    this.name = 'OAuthExchangeError';
  }
}

export interface DiscordApi {
  exchangeCode(code: string): Promise<OAuthToken>;
  /** Best effort; never rejects. */
  revokeToken(accessToken: string): Promise<void>;
  /** ApiError: 401 session_expired, 503 discord_rate_limited, 502 discord_unavailable. */
  getCurrentUser(accessToken: string): Promise<DiscordUser>;
  getUserGuilds(accessToken: string): Promise<UserGuild[]>;
}

function basicAuth(config: WebConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
}

export function createDiscordApi(config: WebConfig, logger: Logger, fetchImpl: typeof fetch = fetch): DiscordApi {
  /** A user-token GET with the error mapping of design 4.14. Logs the method and status only. */
  async function userGet<T>(method: string, path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${API}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Perry-Web (self-hosted dashboard)' },
        signal: AbortSignal.timeout(WEB_DISCORD_TIMEOUT_MS),
      });
    } catch {
      logger.warn({ method }, 'Discord did not answer');
      throw new ApiError('discord_unavailable');
    }
    if (response.status === 401) {
      logger.warn({ method, status: 401 }, 'Discord rejected the user token');
      throw new ApiError('session_expired');
    }
    if (response.status === 429) {
      const body = (await response.json().catch(() => ({}))) as { retry_after?: unknown };
      const retryAfter = typeof body.retry_after === 'number' ? body.retry_after : 5;
      logger.warn({ method, status: 429 }, 'Discord rate limited a user-token call');
      throw new ApiError('discord_rate_limited', { retryAfter });
    }
    if (!response.ok) {
      logger.warn({ method, status: response.status }, 'Discord call failed');
      throw new ApiError('discord_unavailable');
    }
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      logger.warn({ method }, 'Discord answered with an unexpected shape');
      throw new ApiError('discord_unavailable');
    }
    return parsed.data;
  }

  return {
    async exchangeCode(code) {
      let response: Response;
      try {
        response = await fetchImpl(`${API}/oauth2/token`, {
          method: 'POST',
          headers: { Authorization: basicAuth(config), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }),
          signal: AbortSignal.timeout(WEB_DISCORD_TIMEOUT_MS),
        });
      } catch {
        throw new OAuthExchangeError(null);
      }
      if (!response.ok) throw new OAuthExchangeError(response.status);
      const parsed = tokenSchema.safeParse(await response.json().catch(() => undefined));
      if (!parsed.success) throw new OAuthExchangeError(response.status);
      return {
        accessToken: parsed.data.access_token,
        expiresIn: parsed.data.expires_in,
        scopes: parsed.data.scope.split(' ').filter((scope) => scope.length > 0),
      };
    },
    async revokeToken(accessToken) {
      try {
        const response = await fetchImpl(`${API}/oauth2/token/revoke`, {
          method: 'POST',
          headers: { Authorization: basicAuth(config), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: accessToken, token_type_hint: 'access_token' }),
          signal: AbortSignal.timeout(WEB_DISCORD_TIMEOUT_MS),
        });
        if (!response.ok) logger.debug({ status: response.status }, 'Token revocation failed');
      } catch {
        logger.debug('Token revocation did not complete');
      }
    },
    async getCurrentUser(accessToken) {
      const user = await userGet('getCurrentUser', '/users/@me', accessToken, userSchema);
      return { id: user.id, username: user.username, globalName: user.global_name ?? null, avatar: user.avatar };
    },
    getUserGuilds(accessToken) {
      return userGet('getUserGuilds', '/users/@me/guilds', accessToken, guildsSchema);
    },
  };
}
