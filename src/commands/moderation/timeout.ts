import { PermissionFlagsBits } from 'discord.js';
import { runModAction } from '../../moderation/actions.js';
import type { Command } from '../../types/command.js';
import { createCommand, describe } from '../builder.js';
import { DURATION_MAX_LENGTH, readReason, reasonOption, userOption } from './shared.js';

export const timeout: Command = {
  data: createCommand('timeout', (m) => m.commands.timeout.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      describe(sub.setName('set'), (m) => m.commands.timeout.set.description)
        .addUserOption((option) => userOption(option, (m) => m.commands.timeout.set.user))
        .addStringOption((option) =>
          describe(option.setName('duration'), (m) => m.commands.timeout.set.duration)
            .setRequired(true)
            .setMaxLength(DURATION_MAX_LENGTH),
        )
        .addStringOption((option) => reasonOption(option, (m) => m.commands.timeout.set.reason)),
    )
    .addSubcommand((sub) =>
      describe(sub.setName('remove'), (m) => m.commands.timeout.remove.description)
        .addUserOption((option) => userOption(option, (m) => m.commands.timeout.remove.user))
        .addStringOption((option) => reasonOption(option, (m) => m.commands.timeout.remove.reason)),
    ),
  category: 'moderation',
  cooldownSeconds: 3,
  async execute(ctx) {
    const { interaction } = ctx;
    const set = interaction.options.getSubcommand() === 'set';
    await runModAction(ctx, {
      action: set ? 'timeout' : 'untimeout',
      permission: 'ModerateMembers',
      botNeedsPermission: true,
      target: {
        kind: 'user',
        user: interaction.options.getUser('user', true),
        member: interaction.options.getMember('user'),
      },
      reason: readReason(interaction),
      ...(set ? { duration: interaction.options.getString('duration', true) } : {}),
    });
  },
};
