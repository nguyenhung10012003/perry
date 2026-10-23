import { Events } from 'discord.js';
import type { BotEvent } from './index.js';

/** A message was posted: it may earn XP (GuildMessages intent; the content is not needed). Never rejects. */
export const messageCreate: BotEvent<Events.MessageCreate> = {
  name: Events.MessageCreate,
  async execute(client, message) {
    await client.leveling.handleMessage(message);
  },
};
