import { Events } from 'discord.js';
import type { BotEvent } from './index.js';

/**
 * A channel was deleted: clear every setting that points to it (the mod-log channel). One atomic update per event,
 * because deleting a category emits one event per child channel at the same time. Never rejects.
 */
export const channelDelete: BotEvent<Events.ChannelDelete> = {
  name: Events.ChannelDelete,
  async execute(client, channel) {
    // discord.js also emits this for DM channels.
    if (channel.isDMBased()) return;
    await client.settings.removeReferences(channel.guild.id, { channelId: channel.id });
  },
};
