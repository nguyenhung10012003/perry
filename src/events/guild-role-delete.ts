import { Events } from 'discord.js';
import type { BotEvent } from './index.js';

/**
 * A role was deleted: clear every setting that points to it (the DJ role, so the DJ gate does not lock non-admins
 * out). One atomic update instead of get-then-update, because handlers run concurrently (a role and its settings
 * can be touched by several events at once). Never rejects.
 */
export const guildRoleDelete: BotEvent<Events.GuildRoleDelete> = {
  name: Events.GuildRoleDelete,
  async execute(client, role) {
    await client.settings.removeReferences(role.guild.id, { roleId: role.id });
  },
};
