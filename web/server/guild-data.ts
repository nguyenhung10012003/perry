import 'server-only';
import { guildMetaSchema } from '../../src/bridge/protocol.js';
import type { BotGuilds, GuildMeta } from '../../src/bridge/protocol.js';
import { GUILD_META_TTL_SECONDS, WEB_USER_GUILDS_TTL_SECONDS } from '../../src/config/constants.js';
import type { Keys } from '../../src/storage/keys.js';
import type { Logger } from '../../src/utils/logger.js';
import type { BridgeClient } from './bridge-client.js';
import type { DiscordApi, UserGuild } from './discord-api.js';
import { userGuildsSchema } from './discord-api.js';
import { ApiError, isApiError } from './errors.js';
import type { RawCache } from './raw-cache.js';
import type { Session, SessionStore } from './session.js';

/**
 * Guild lists and guild data with Redis caches and in-process single-flight, so concurrent identical requests cost
 * one Discord call (the user's guild list, 60 s) or one bridge round trip (the bot's guild data, 60 s).
 */
export interface GuildData {
  /** The user's guilds from Discord (web:uguilds:<userId>, 60 s); a 401 from Discord deletes the session. */
  userGuilds(session: Session): Promise<UserGuild[]>;
  botGuilds(): Promise<BotGuilds>;
  /** The bot's guild data (gmeta:<guildId>, 60 s); refresh drops the cached copy first. */
  guildMeta(guildId: string, options?: { refresh?: boolean }): Promise<GuildMeta>;
}

export interface GuildDataDeps {
  cache: RawCache;
  keys: Keys;
  discord: DiscordApi;
  bridge: BridgeClient;
  sessions: SessionStore;
  logger: Logger;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Concurrent calls with the same key share one promise. */
function singleFlight<T>(): (key: string, run: () => Promise<T>) => Promise<T> {
  const inFlight = new Map<string, Promise<T>>();
  return (key, run) => {
    const pending = inFlight.get(key);
    if (pending !== undefined) return pending;
    const started = run().finally(() => inFlight.delete(key));
    inFlight.set(key, started);
    return started;
  };
}

export function createGuildData(deps: GuildDataDeps): GuildData {
  const userFlight = singleFlight<UserGuild[]>();
  const metaFlight = singleFlight<GuildMeta>();
  return {
    async userGuilds(session) {
      const key = deps.keys.webUserGuilds(session.record.userId);
      const cached = await deps.cache.get(key);
      if (cached.ok && cached.value !== null) {
        const parsed = userGuildsSchema.safeParse(parseJson(cached.value));
        if (parsed.success) return parsed.data;
      }
      return userFlight(session.record.userId, async () => {
        try {
          const guilds = await deps.discord.getUserGuilds(session.accessToken);
          await deps.cache.set(key, JSON.stringify(guilds), WEB_USER_GUILDS_TTL_SECONDS);
          return guilds;
        } catch (err) {
          if (isApiError(err) && err.code === 'session_expired') await deps.sessions.delete(session.id);
          throw err;
        }
      });
    },
    botGuilds: () => deps.bridge.botGuilds(),
    async guildMeta(guildId, options = {}) {
      const key = deps.keys.guildMeta(guildId);
      if (options.refresh === true) {
        await deps.cache.del(key);
      } else {
        const cached = await deps.cache.get(key);
        if (!cached.ok) throw new ApiError('storage_unavailable');
        if (cached.value !== null) {
          const parsed = guildMetaSchema.safeParse(parseJson(cached.value));
          if (parsed.success) return parsed.data;
        }
      }
      return metaFlight(guildId, async () => {
        const meta = await deps.bridge.request('gmeta', guildId, {});
        await deps.cache.set(key, JSON.stringify(meta), GUILD_META_TTL_SECONDS);
        return meta;
      });
    },
  };
}
