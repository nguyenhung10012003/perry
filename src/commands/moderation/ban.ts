import { PermissionFlagsBits } from 'discord.js';
import { BAN_DELETE_SECONDS } from '../../config/constants.js';
import { runModAction } from '../../moderation/actions.js';
import type { Command } from '../../types/command.js';
import { choice, createCommand, describe } from '../builder.js';
import { readReason, reasonOption, userOption } from './shared.js';

type DeleteChoice = keyof typeof BAN_DELETE_SECONDS;
const DELETE_CHOICES = Object.keys(BAN_DELETE_SECONDS) as DeleteChoice[];

function isDeleteChoice(value: string | null): value is DeleteChoice {
  return value !== null && Object.hasOwn(BAN_DELETE_SECONDS, value);
}

export const ban: Command = {
  data: createCommand('ban', (m) => m.commands.ban.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => userOption(option, (m) => m.commands.ban.user))
    .addStringOption((option) => reasonOption(option, (m) => m.commands.ban.reason))
    .addStringOption((option) =>
      describe(option.setName('delete_messages'), (m) => m.commands.ban.deleteMessages).addChoices(
        ...DELETE_CHOICES.map((value) => choice(value, (m) => m.commands.ban.deleteChoices[value])),
      ),
    ),
  category: 'moderation',
  cooldownSeconds: 3,
  async execute(ctx) {
    const { interaction } = ctx;
    const deleteChoice = interaction.options.getString('delete_messages');
    await runModAction(ctx, {
      action: 'ban',
      permission: 'BanMembers',
      botNeedsPermission: true,
      // Works for users who are not in the server (member null): only the self, bot and owner rules apply then.
      target: {
        kind: 'user',
        user: interaction.options.getUser('user', true),
        member: interaction.options.getMember('user'),
      },
      reason: readReason(interaction),
      deleteMessageSeconds: isDeleteChoice(deleteChoice) ? BAN_DELETE_SECONDS[deleteChoice] : 0,
    });
  },
};
