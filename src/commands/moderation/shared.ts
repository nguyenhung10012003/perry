import { PermissionFlagsBits } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  SlashCommandStringOption,
  SlashCommandUserOption,
} from 'discord.js';
import { MOD_REASON_MAX_LENGTH } from '../../config/constants.js';
import type { ModAction, TargetCheckInput } from '../../moderation/target-check.js';
import { truncate } from '../../music/format.js';
import type { MessageSelector } from '../builder.js';
import { describe } from '../builder.js';

/** Discord user ids are 17-20 digit snowflakes; /unban also accepts the mention forms <@id> and <@!id> (A7). */
const USER_ID_RE = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/;
/** `/unban user` option limit (4.8). */
export const UNBAN_USER_MAX_LENGTH = 32;
/** `/timeout set duration` option limit (4.8). */
export const DURATION_MAX_LENGTH = 20;

/** The bot's own member (cached with the Guilds intent; fetched once otherwise). */
export async function fetchMe(guild: Guild): Promise<GuildMember> {
  return guild.members.me ?? (await guild.members.fetchMe());
}

/**
 * Adapter from discord.js objects to the pure target check (4.6.1). Role order comes from comparePositionTo, which
 * breaks equal positions by role id the way Discord does.
 */
export function targetCheckInput(
  action: ModAction,
  invoker: GuildMember,
  targetId: string,
  target: GuildMember | null,
  me: GuildMember,
  ownerId: string,
): TargetCheckInput {
  return {
    action,
    invokerId: invoker.id,
    targetId,
    botId: me.id,
    ownerId,
    member:
      target === null
        ? null
        : {
            invokerVsTarget: invoker.roles.highest.comparePositionTo(target.roles.highest),
            botVsTarget: me.roles.highest.comparePositionTo(target.roles.highest),
            isAdministrator: target.permissions.has(PermissionFlagsBits.Administrator),
          },
  };
}

/** The user id of `<@id>`, `<@!id>` or a bare 17-20 digit id, else null. */
export function parseUserId(raw: string): string | null {
  const match = USER_ID_RE.exec(raw.trim());
  return match ? (match[1] ?? match[2] ?? null) : null;
}

/** The `reason` option, trimmed (empty means none) and cut to MOD_REASON_MAX_LENGTH (repo input rule). */
export function readReason(interaction: ChatInputCommandInteraction<'cached'>): string | null {
  const raw = interaction.options.getString('reason')?.trim() ?? '';
  return raw === '' ? null : truncate(raw, MOD_REASON_MAX_LENGTH);
}

/** A `user` option with its localized description. */
export function userOption(option: SlashCommandUserOption, select: MessageSelector): SlashCommandUserOption {
  return describe(option.setName('user'), select).setRequired(true);
}

/** A `reason` option limited to MOD_REASON_MAX_LENGTH characters. */
export function reasonOption(
  option: SlashCommandStringOption,
  select: MessageSelector,
  required = false,
): SlashCommandStringOption {
  return describe(option.setName('reason'), select).setRequired(required).setMaxLength(MOD_REASON_MAX_LENGTH);
}
