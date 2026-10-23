import { PermissionFlagsBits } from 'discord.js';
import { runModAction } from '../../moderation/actions.js';
import type { Command } from '../../types/command.js';
import { createCommand } from '../builder.js';
import { readReason, reasonOption, userOption } from './shared.js';

export const warn: Command = {
  data: createCommand('warn', (m) => m.commands.warn.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => userOption(option, (m) => m.commands.warn.user))
    .addStringOption((option) => reasonOption(option, (m) => m.commands.warn.reason, true)),
  category: 'moderation',
  cooldownSeconds: 3,
  async execute(ctx) {
    const { interaction } = ctx;
    await runModAction(ctx, {
      action: 'warn',
      permission: 'ModerateMembers',
      // A warning is only a record and a DM: the bot needs no guild permission for it.
      botNeedsPermission: false,
      // Only current members can be warned (A9), so the hierarchy rules always apply.
      target: {
        kind: 'user',
        user: interaction.options.getUser('user', true),
        member: interaction.options.getMember('user'),
      },
      reason: readReason(interaction),
    });
  },
};
