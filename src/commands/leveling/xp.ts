import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { SlashCommandUserOption } from 'discord.js';
import { XP_ADJUST_MAX, XP_TOTAL_MAX } from '../../config/constants.js';
import type { XpAdjustment } from '../../storage/types.js';
import type { Command } from '../../types/command.js';
import { replyError, replyInfo } from '../../utils/respond.js';
import type { MessageSelector } from '../builder.js';
import { createCommand, describe } from '../builder.js';

function userOption(option: SlashCommandUserOption, select: MessageSelector): SlashCommandUserOption {
  return describe(option.setName('user'), select).setRequired(true);
}

/** The option value if it is an integer in min..max (the repo input rule re-check of the Discord option limits). */
function inRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export const xp: Command = {
  data: createCommand('xp', (m) => m.commands.xp.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      describe(sub.setName('add'), (m) => m.commands.xp.add.description)
        .addUserOption((option) => userOption(option, (m) => m.commands.xp.add.user))
        .addIntegerOption((option) =>
          describe(option.setName('amount'), (m) => m.commands.xp.add.amount)
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(XP_ADJUST_MAX),
        ),
    )
    .addSubcommand((sub) =>
      describe(sub.setName('remove'), (m) => m.commands.xp.remove.description)
        .addUserOption((option) => userOption(option, (m) => m.commands.xp.remove.user))
        .addIntegerOption((option) =>
          describe(option.setName('amount'), (m) => m.commands.xp.remove.amount)
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(XP_ADJUST_MAX),
        ),
    )
    .addSubcommand((sub) =>
      describe(sub.setName('set'), (m) => m.commands.xp.set.description)
        .addUserOption((option) => userOption(option, (m) => m.commands.xp.set.user))
        .addIntegerOption((option) =>
          describe(option.setName('xp'), (m) => m.commands.xp.set.xp)
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(XP_TOTAL_MAX),
        ),
    )
    .addSubcommand((sub) =>
      describe(sub.setName('reset'), (m) => m.commands.xp.reset.description).addUserOption((option) =>
        userOption(option, (m) => m.commands.xp.reset.user),
      ),
    ),
  category: 'leveling',
  cooldownSeconds: 2,
  async execute({ interaction, client, t, locale }) {
    // Guild admins can override command permissions in Integrations, so re-check here (Administrator implies it).
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await replyError(interaction, t.settings.noPermission);
      return;
    }
    const { guildId } = interaction;
    const user = interaction.options.getUser('user', true);
    if (user.bot) {
      await replyError(interaction, t.leveling.botsNoXp);
      return;
    }
    const format = new Intl.NumberFormat(locale);
    const subcommand = interaction.options.getSubcommand();
    const mention = `<@${user.id}>`;
    const { levels } = client.storage;

    let op: XpAdjustment | null = null;
    if (subcommand === 'add' || subcommand === 'remove') {
      const amount = interaction.options.getInteger('amount', true);
      if (!inRange(amount, 1, XP_ADJUST_MAX)) {
        await replyError(interaction, t.leveling.xp.amountOutOfRange(format.format(1), format.format(XP_ADJUST_MAX)));
        return;
      }
      op = { kind: subcommand, amount };
    } else if (subcommand === 'set') {
      const amount = interaction.options.getInteger('xp', true);
      if (!inRange(amount, 0, XP_TOTAL_MAX)) {
        await replyError(interaction, t.leveling.xp.amountOutOfRange(format.format(0), format.format(XP_TOTAL_MAX)));
        return;
      }
      op = { kind: 'set', amount };
    } else if (subcommand !== 'reset') {
      await replyError(interaction, t.errors.unknownCommand);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // Rewards are re-synced only while the user is still a member. /xp changes are never announced (A13).
    const member = interaction.options.getMember('user');

    if (op === null) {
      const reset = await levels.reset(guildId, user.id);
      if (!reset.ok) {
        await replyError(interaction, t.leveling.storageUnavailable);
        return;
      }
      if (!reset.value) {
        await replyError(interaction, t.leveling.xp.notFound);
        return;
      }
      if (member) await client.leveling.syncRewards(member, 0);
      await replyInfo(interaction, t.leveling.xp.reset(mention));
      return;
    }

    const changed = await levels.adjust(guildId, user.id, op);
    if (!changed.ok) {
      await replyError(interaction, t.leveling.storageUnavailable);
      return;
    }
    const { xp: total, level } = changed.value;
    if (member) await client.leveling.syncRewards(member, level);
    const xpText = format.format(total);
    const levelText = format.format(level);
    const amountText = format.format(op.amount);
    const line =
      op.kind === 'add'
        ? t.leveling.xp.added(mention, amountText, xpText, levelText)
        : op.kind === 'remove'
          ? t.leveling.xp.removed(mention, amountText, xpText, levelText)
          : t.leveling.xp.set(mention, xpText, levelText);
    await replyInfo(interaction, line);
  },
};
