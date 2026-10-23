import 'server-only';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  BRIDGE_VERSION,
  botGuildsSchema,
  bridgeDataSchemas,
  bridgeReplySchema,
} from '../../src/bridge/protocol.js';
import type { BotGuilds, BridgeDataTypes, BridgePayloads, BridgeRequestType } from '../../src/bridge/protocol.js';
import { BRIDGE_POLL_INTERVAL_MS, BRIDGE_TIMEOUT_MS, WEB_BOT_GUILDS_MEMO_MS } from '../../src/config/constants.js';
import type { Keys } from '../../src/storage/keys.js';
import type { Logger } from '../../src/utils/logger.js';
import { ApiError } from './errors.js';
import type { RawCache } from './raw-cache.js';

/** Web side of the bot-mediated bridge (DP-10 (b)); see src/bridge/protocol.ts. */
export interface BridgeClient {
  /** Throws ApiError: 503 storage_unavailable / bot_unavailable, 404 bot_not_in_guild, 409, 422, 502, 500. */
  request<T extends BridgeRequestType>(type: T, guildId: string, payload: BridgePayloads[T]): Promise<BridgeDataTypes[T]>;
  /** The bot's guild list; 503 bot_unavailable when the key is missing or unreadable (5 s in-process memo). */
  botGuilds(): Promise<BotGuilds>;
  /** Drops the memo (after a not_in_guild reply). */
  forgetBotGuilds(): void;
}

export interface BridgeClientDeps {
  cache: RawCache;
  keys: Keys;
  logger: Logger;
  now?: () => number;
  pollIntervalMs?: number;
}

export function createBridgeClient(deps: BridgeClientDeps): BridgeClient {
  const now = deps.now ?? Date.now;
  const pollInterval = deps.pollIntervalMs ?? BRIDGE_POLL_INTERVAL_MS;
  let memo: { value: BotGuilds; until: number } | null = null;

  return {
    async request(type, guildId, payload) {
      const id = randomUUID();
      const started = now();
      const deadline = started + BRIDGE_TIMEOUT_MS[type];
      const message = JSON.stringify({ ...payload, v: BRIDGE_VERSION, id, guildId, deadline, type });
      const published = await deps.cache.publish(deps.keys.bridgeEvents(), message);
      if (!published.ok) throw new ApiError('storage_unavailable');
      if (published.value === 0) {
        deps.logger.debug({ type }, 'No bot is subscribed to the bridge');
        throw new ApiError('bot_unavailable');
      }
      const replyKey = deps.keys.bridgeResponse(id);
      while (now() < deadline) {
        await sleep(pollInterval);
        const raw = await deps.cache.get(replyKey);
        if (!raw.ok) throw new ApiError('storage_unavailable');
        if (raw.value === null) continue;
        void deps.cache.del(replyKey);
        let json: unknown;
        try {
          json = JSON.parse(raw.value);
        } catch {
          json = undefined;
        }
        const reply = bridgeReplySchema.safeParse(json);
        if (!reply.success || reply.data.id !== id) {
          deps.logger.warn({ type }, 'Unreadable bridge reply');
          throw new ApiError('bot_unavailable');
        }
        if (!reply.data.ok) {
          switch (reply.data.error) {
            case 'not_in_guild':
              memo = null;
              throw new ApiError('bot_not_in_guild');
            case 'missing_permission':
              throw new ApiError('bot_missing_permission');
            case 'discord_rejected':
              throw new ApiError('discord_rejected', { discordCode: reply.data.code });
            case 'invalid_request':
              deps.logger.error({ type }, 'The bot rejected a bridge request as invalid');
              throw new ApiError('internal_error');
            default:
              throw new ApiError('discord_unavailable');
          }
        }
        const data = bridgeDataSchemas[type].safeParse(reply.data.data);
        if (!data.success) {
          const paths = data.error.issues.slice(0, 5).map((issue) => issue.path.map(String).join('.'));
          deps.logger.warn({ type, paths }, 'Bridge reply data does not match the protocol');
          throw new ApiError('bot_unavailable');
        }
        return data.data as BridgeDataTypes[typeof type];
      }
      deps.logger.warn({ type, ms: now() - started }, 'The bot did not answer a bridge request in time');
      throw new ApiError('bot_unavailable');
    },
    async botGuilds() {
      if (memo !== null && memo.until > now()) return memo.value;
      const raw = await deps.cache.get(deps.keys.botGuilds());
      if (!raw.ok) throw new ApiError('storage_unavailable');
      if (raw.value === null) {
        deps.logger.debug('The bot guild list is missing');
        throw new ApiError('bot_unavailable');
      }
      let json: unknown;
      try {
        json = JSON.parse(raw.value);
      } catch {
        json = undefined;
      }
      const parsed = botGuildsSchema.safeParse(json);
      if (!parsed.success) {
        deps.logger.warn('The bot guild list is unreadable');
        throw new ApiError('bot_unavailable');
      }
      memo = { value: parsed.data, until: now() + WEB_BOT_GUILDS_MEMO_MS };
      return parsed.data;
    },
    forgetBotGuilds() {
      memo = null;
    },
  };
}
