import { PermissionFlagsBits } from 'discord.js';
import { runModAction } from '../../moderation/actions.js';
import type { Command } from '../../types/command.js';
import { createCommand, describe } from '../builder.js';
import { readReason, reasonOption, UNBAN_USER_MAX_LENGTH } from './shared.js';

export const unban: Command = {
  data: createCommand('unban', (m) => m.commands.unban.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    // A banned user cannot be picked from the member list, so the id or mention is typed (A7).
    .addStringOption((option) =>
      describe(option.setName('user'), (m) => m.commands.unban.user)
        .setRequired(true)
        .setMaxLength(UNBAN_USER_MAX_LENGTH),
    )
    .addStringOption((option) => reasonOption(option, (m) => m.commands.unban.reason)),
  category: 'moderation',
  cooldownSeconds: 3,
  async execute(ctx) {
    const { interaction } = ctx;
    await runModAction(ctx, {
      action: 'unban',
      permission: 'BanMembers',
      botNeedsPermission: true,
      target: { kind: 'id', raw: interaction.options.getString('user', true) },
      reason: readReason(interaction),
    });
  },
};
