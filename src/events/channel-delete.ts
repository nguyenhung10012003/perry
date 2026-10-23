import { Events } from 'discord.js';
import type { BotEvent } from './index.js';

/**
 * A channel was deleted: clear every setting that points to it (the mod-log and level-up channels, the XP-ignored
 * channels). One atomic update per event, because deleting a category emits one event per child channel at the same
 * time. The web's cached guild data (gmeta) is dropped, so the channel leaves the dashboard pickers at once.
 * Never rejects.
 */
export const channelDelete: BotEvent<Events.ChannelDelete> = {
  name: Events.ChannelDelete,
  async execute(client, channel) {
    // discord.js also emits this for DM channels.
    if (channel.isDMBased()) return;
    const guildId = channel.guild.id;
    await Promise.all([
      client.settings.removeReferences(guildId, { channelId: channel.id }),
      client.storage.cache.del(client.storage.keys.guildMeta(guildId)),
    ]);
  },
};
