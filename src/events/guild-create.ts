import { Events } from 'discord.js';
import type { BotEvent } from './index.js';

/** The bot joined a guild: republish its guild list for the web dashboard 2 s from now (coalesced). */
export const guildCreate: BotEvent<Events.GuildCreate> = {
  name: Events.GuildCreate,
  execute(client) {
    client.bridge?.scheduleGuildsRefresh();
  },
};
