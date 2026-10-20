import { Events } from 'discord.js';
import { safeError } from '../utils/errors.js';
import type { BotEvent } from './index.js';

/**
 * The bot was removed from a guild (discord.js only emits this for real removals, not outages):
 * drop its player, timers and settings so nothing lingers. lavalink-client does not react to a guild
 * removal on its own, so without this the player would stay registered forever.
 */
export const guildDelete: BotEvent<Events.GuildDelete> = {
  name: Events.GuildDelete,
  async execute(client, guild) {
    try {
      await client.music.destroyPlayer(guild.id, 'GuildRemoved');
    } catch (err) {
      client.logger.warn({ err: safeError(err), guildId: guild.id }, 'Could not destroy the player of a removed guild');
      client.music.disposeState(guild.id);
    }
    await client.settings.reset(guild.id);
    await client.storage.purgeGuild(guild.id);
  },
};
