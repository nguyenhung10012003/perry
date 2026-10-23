import { PermissionFlagsBits } from 'discord.js';
import { runModAction } from '../../moderation/actions.js';
import type { Command } from '../../types/command.js';
import { createCommand } from '../builder.js';
import { readReason, reasonOption, userOption } from './shared.js';

export const kick: Command = {
  data: createCommand('kick', (m) => m.commands.kick.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => userOption(option, (m) => m.commands.kick.user))
    .addStringOption((option) => reasonOption(option, (m) => m.commands.kick.reason)),
  category: 'moderation',
  cooldownSeconds: 3,
  async execute(ctx) {
    const { interaction } = ctx;
    await runModAction(ctx, {
      action: 'kick',
      permission: 'KickMembers',
      botNeedsPermission: true,
      target: {
        kind: 'user',
        user: interaction.options.getUser('user', true),
        member: interaction.options.getMember('user'),
      },
      reason: readReason(interaction),
    });
  },
};
