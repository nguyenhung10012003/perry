import { PermissionFlagsBits } from 'discord.js';
import type { Guild, RoleColors } from 'discord.js';
import { GUILD_META_CHANNEL_TYPES } from './protocol.js';
import type { GuildMeta, GuildMetaChannelType } from './protocol.js';

const LISTED_TYPES = new Set<number>(GUILD_META_CHANNEL_TYPES);

function isListedType(type: number): type is GuildMetaChannelType {
  return LISTED_TYPES.has(type);
}

/**
 * The guild data of the dashboard pickers, from the discord.js cache (Guilds intent: channels with their overwrites,
 * roles and the bot's own member). Null when the bot's member is not cached yet.
 */
export function collectGuildMeta(guild: Guild): GuildMeta | null {
  const me = guild.members.me;
  if (me === null) return null;
  const channels: GuildMeta['channels'] = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.isThread() || !isListedType(channel.type)) continue;
    // Same rule as postableTextChannel (/settings mod-log): embeds need View Channel, Send Messages and Embed Links.
    const botCanPost =
      channel.isTextBased() &&
      channel
        .permissionsFor(me)
        .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    channels.push({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      position: channel.rawPosition,
      botCanPost,
    });
  }
  const highest = me.roles.highest;
  const roles: GuildMeta['roles'] = [];
  for (const role of guild.roles.cache.values()) {
    roles.push({
      id: role.id,
      name: role.name,
      // Filled from the role's `colors` field; payloads without it (older gateways) count as no color.
      color: (role.colors as RoleColors | undefined)?.primaryColor ?? 0,
      position: role.position,
      managed: role.managed,
      // Role.editable is not used: it is true for @everyone.
      assignable: !role.managed && role.id !== guild.id && highest.comparePositionTo(role) > 0,
    });
  }
  return {
    channels,
    roles,
    botTopRolePosition: highest.position,
    botPermissions: {
      manageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
      manageGuild: me.permissions.has(PermissionFlagsBits.ManageGuild),
      moderateMembers: me.permissions.has(PermissionFlagsBits.ModerateMembers),
    },
  };
}
