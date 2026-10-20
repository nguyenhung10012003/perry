import { Events } from 'discord.js';
import type { LavalinkManager } from 'lavalink-client';
import type { BotClient } from '../client/bot-client.js';
import { safeError } from '../utils/errors.js';

type RawPacket = Parameters<LavalinkManager['sendRawData']>[0];

/** Gateway dispatches lavalink-client needs to establish voice connections. */
const FORWARDED = new Set(['VOICE_STATE_UPDATE', 'VOICE_SERVER_UPDATE', 'CHANNEL_DELETE']);

/**
 * Forwards raw gateway packets to lavalink-client. `Events.Raw` is not part of discord.js' typed
 * ClientEvents, so this is attached directly instead of going through the events list.
 * Only the three relevant dispatches are forwarded (the raw event fires for every packet).
 */
export function registerRawForwarding(client: BotClient): void {
  client.on(Events.Raw, (packet: unknown) => {
    const type = (packet as { t?: unknown } | null)?.t;
    if (typeof type !== 'string' || !FORWARDED.has(type)) return;
    const manager = client.music.manager;
    if (!manager.initiated) return;
    manager.sendRawData(packet as RawPacket).catch((err: unknown) => {
      client.logger.warn({ err: safeError(err), packet: type }, 'Failed to forward raw packet to Lavalink');
    });
  });
}
