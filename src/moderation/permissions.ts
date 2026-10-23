import { PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction, GuildMember, GuildTextBasedChannel } from 'discord.js';
import type { Messages } from '../i18n/index.js';

/** A permission name that is both a discord.js flag and a localized label (t.permissions). */
export type PermissionKey = keyof Messages['permissions'] & keyof typeof PermissionFlagsBits;

/** The guild permissions the bot is missing (Administrator implies all of them). */
export function missingGuildPermissions(me: GuildMember, keys: readonly PermissionKey[]): PermissionKey[] {
  return keys.filter((key) => !me.permissions.has(PermissionFlagsBits[key]));
}

/** The permissions the bot is missing in a channel, with its overwrites applied. */
export function missingChannelPermissions(
  channel: GuildTextBasedChannel,
  me: GuildMember,
  keys: readonly PermissionKey[],
): PermissionKey[] {
  const permissions = channel.permissionsFor(me);
  return keys.filter((key) => !permissions?.has(PermissionFlagsBits[key]));
}

/**
 * Runtime re-check of the invoker's permission (M2): server admins can override a command's default member
 * permissions in Integrations. Administrator implies every permission.
 */
export function invokerHas(interaction: ChatInputCommandInteraction<'cached'>, key: PermissionKey): boolean {
  return interaction.member.permissions.has(PermissionFlagsBits[key]);
}
