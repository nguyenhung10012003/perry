import { DiscordAPIError } from 'discord.js';
import type { Guild } from 'discord.js';
import type { BotClient } from '../client/bot-client.js';
import {
  BRIDGE_BOTGUILDS_INTERVAL_MS,
  BRIDGE_BOTGUILDS_REFRESH_DELAY_MS,
  BRIDGE_BOTGUILDS_TTL_SECONDS,
  BRIDGE_RESPONSE_TTL_SECONDS,
  BRIDGE_STOP_TIMEOUT_MS,
} from '../config/constants.js';
import type { Keys } from '../storage/keys.js';
import type { KeyValueCache } from '../storage/types.js';
import type { Logger } from '../utils/logger.js';
import { childLogger } from '../utils/logger.js';
import { safeError } from '../utils/safe-error.js';
import { settleWithin } from '../utils/timeout.js';
import { inGuildChain, listPerryRules, putPerryRule, automodAvailable } from './automod.js';
import { collectGuildMeta } from './guild-meta.js';
import { BRIDGE_VERSION, bridgeRequestSchema } from './protocol.js';
import type { BotGuilds, BridgeError, BridgeReply, BridgeRequest, GuildMeta } from './protocol.js';

/**
 * Bot side of the web bridge (DP-10 (b)): answers whitelisted requests from the web out of the discord.js cache
 * (guild data) or with discord.js (AutoMod rules), and publishes the bot's guild list. The bot trusts these requests
 * (Redis is password-protected and internal) and only checks that it is in the guild; the web has already checked
 * that the user may manage it.
 */

export interface BridgeServer {
  /** Rewrites `botguilds` 2 s from now (coalesced); called on ready, guild join and guild leave. */
  scheduleGuildsRefresh(): void;
  /** Stops the timers and the subscription and deletes `botguilds`, so the web reports bot_unavailable at once. */
  stop(): Promise<void>;
}

export interface BridgeDeps {
  getGuild(guildId: string): Guild | undefined;
  isReady(): boolean;
  readonly cache: KeyValueCache;
  readonly keys: Keys;
  readonly logger: Logger;
  readonly now?: () => number;
}

/** Concurrent gmeta requests for one guild share one collection. */
const metaInFlight = new Map<string, Promise<GuildMeta | null>>();

function guildMetaOnce(guild: Guild): Promise<GuildMeta | null> {
  let pending = metaInFlight.get(guild.id);
  if (pending === undefined) {
    pending = Promise.resolve().then(() => collectGuildMeta(guild));
    metaInFlight.set(guild.id, pending);
    const done = pending;
    void done.finally(() => {
      if (metaInFlight.get(guild.id) === done) metaInFlight.delete(guild.id);
    });
  }
  return pending;
}

function readableId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id } = raw as { id?: unknown };
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

async function reply(deps: BridgeDeps, value: BridgeReply): Promise<void> {
  await deps.cache.setJson(deps.keys.bridgeResponse(value.id), value, BRIDGE_RESPONSE_TTL_SECONDS);
}

function failure(id: string, error: BridgeError, code?: number): BridgeReply {
  return code === undefined ? { v: BRIDGE_VERSION, id, ok: false, error } : { v: BRIDGE_VERSION, id, ok: false, error, code };
}

/** Maps a discord.js failure: 50013 -> missing_permission, other 4xx -> discord_rejected, anything else -> internal. */
function discordFailure(deps: BridgeDeps, request: BridgeRequest, err: unknown): BridgeReply {
  if (err instanceof DiscordAPIError) {
    if (err.code === 50013) {
      deps.logger.warn({ type: request.type, guildId: request.guildId }, 'Bridge request lacks a Discord permission');
      return failure(request.id, 'missing_permission');
    }
    if (err.status >= 400 && err.status < 500) {
      return failure(request.id, 'discord_rejected', typeof err.code === 'number' ? err.code : undefined);
    }
  }
  deps.logger.warn({ err: safeError(err), type: request.type, guildId: request.guildId }, 'Bridge request failed');
  return failure(request.id, 'internal');
}

/**
 * Handles one message from `evt:bridge`. Never rejects. Invalid requests get `invalid_request` when their id is
 * readable; expired requests and requests that arrive while the client is not ready get no reply (the web times out).
 */
export async function handleBridgeMessage(deps: BridgeDeps, raw: string): Promise<void> {
  const now = deps.now ?? Date.now;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    deps.logger.debug('Dropped an unreadable bridge message');
    return;
  }
  const parsed = bridgeRequestSchema.safeParse(json);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.map(String).join('.'));
    deps.logger.debug({ paths }, 'Invalid bridge request');
    const id = readableId(json);
    if (id !== null) await reply(deps, failure(id, 'invalid_request'));
    return;
  }
  const request = parsed.data;
  if (now() > request.deadline) {
    deps.logger.debug({ type: request.type }, 'Dropped an expired bridge request');
    return;
  }
  if (!deps.isReady()) {
    deps.logger.debug({ type: request.type }, 'Dropped a bridge request: the client is not ready');
    return;
  }
  const guild = deps.getGuild(request.guildId);
  if (guild === undefined) {
    await reply(deps, failure(request.id, 'not_in_guild'));
    return;
  }
  try {
    if (request.type === 'gmeta') {
      const meta = await guildMetaOnce(guild);
      await reply(deps, meta === null ? failure(request.id, 'internal') : { v: BRIDGE_VERSION, id: request.id, ok: true, data: meta });
      return;
    }
    if (request.type === 'automod.list') {
      const data = await inGuildChain(guild.id, () => listPerryRules(guild));
      await reply(deps, { v: BRIDGE_VERSION, id: request.id, ok: true, data });
      return;
    }
    if (!automodAvailable(guild)) {
      await reply(deps, failure(request.id, 'missing_permission'));
      return;
    }
    const outcome = await inGuildChain(guild.id, () =>
      putPerryRule(guild, request.kind, request.body, request.actor, request.deadline, now),
    );
    if (outcome.dropped) {
      deps.logger.debug({ type: request.type }, 'Dropped a queued AutoMod change: its deadline passed while it waited');
      return;
    }
    await reply(deps, { v: BRIDGE_VERSION, id: request.id, ok: true, data: { rule: outcome.rule } });
  } catch (err) {
    await reply(deps, discordFailure(deps, request, err));
  }
}

/** The client surface the bridge needs (a fake one in tests). */
export type BridgeHost = Pick<BotClient, 'storage' | 'logger' | 'isReady' | 'guilds'>;

/** The bot's guild list as written to `botguilds`. */
export function botGuildsValue(host: Pick<BotClient, 'guilds'>, at: number): BotGuilds {
  const guilds: BotGuilds['guilds'] = [];
  for (const guild of host.guilds.cache.values()) {
    if (!guild.available || guild.name.length === 0) continue;
    guilds.push({ id: guild.id, name: guild.name.slice(0, 100), icon: guild.icon });
    if (guilds.length >= 10_000) break;
  }
  return { v: BRIDGE_VERSION, at, guilds };
}

/**
 * Subscribes to the bridge channel and starts the `botguilds` writer (every 60 s while the client is ready, and 2 s
 * after scheduleGuildsRefresh). A no-op with the memory storage driver (no Redis).
 */
export function startBridge(host: BridgeHost): BridgeServer {
  const { storage } = host;
  const log = childLogger(host.logger, 'bridge');
  const deps: BridgeDeps = {
    getGuild: (guildId) => host.guilds.cache.get(guildId),
    isReady: () => host.isReady(),
    cache: storage.cache,
    keys: storage.keys,
    logger: log,
  };
  const subscription = storage.subscribe(storage.keys.bridgeEvents(), (payload) => {
    void handleBridgeMessage(deps, payload);
  });
  if (subscription === null) {
    return { scheduleGuildsRefresh: () => undefined, stop: () => Promise.resolve() };
  }

  let stopped = false;
  let refreshTimer: NodeJS.Timeout | undefined;
  const writeGuilds = async (): Promise<void> => {
    if (stopped || !host.isReady()) return;
    const written = await storage.cache.setJson(
      storage.keys.botGuilds(),
      botGuildsValue(host, Date.now()),
      BRIDGE_BOTGUILDS_TTL_SECONDS,
    );
    if (!written) log.debug('Could not write the bot guild list');
  };
  const interval = setInterval(() => void writeGuilds(), BRIDGE_BOTGUILDS_INTERVAL_MS);
  interval.unref();

  return {
    scheduleGuildsRefresh() {
      if (stopped || refreshTimer !== undefined) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void writeGuilds();
      }, BRIDGE_BOTGUILDS_REFRESH_DELAY_MS);
      refreshTimer.unref();
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      subscription.close();
      await settleWithin(storage.cache.del(storage.keys.botGuilds()), BRIDGE_STOP_TIMEOUT_MS);
    },
  };
}
