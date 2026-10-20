import { Events } from 'discord.js';
import type { BotEvent } from './index.js';

/** The DJ role was deleted: clear it so the DJ gate does not lock non-admins out. Errors are logged by the registerEvents wrapper. */
export const guildRoleDelete: BotEvent<Events.GuildRoleDelete> = {
  name: Events.GuildRoleDelete,
  async execute(client, role) {
    const settings = await client.settings.get(role.guild.id);
    if (settings.djRoleId === role.id) await client.settings.update(role.guild.id, { djRoleId: null });
  },
};
