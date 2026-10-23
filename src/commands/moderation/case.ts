import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { SlashCommandIntegerOption } from 'discord.js';
import { CASE_NUMBER_MAX, parseCaseNumber } from '../../moderation/limits.js';
import { buildCaseEmbed, editModLog } from '../../moderation/mod-log.js';
import { invokerHas } from '../../moderation/permissions.js';
import type { Command } from '../../types/command.js';
import { replyError, replyInfo } from '../../utils/respond.js';
import type { MessageSelector } from '../builder.js';
import { createCommand, describe } from '../builder.js';
import { readReason, reasonOption } from './shared.js';

/** Every `number` option fits the Postgres integer column (M11, acceptance 4a). */
function numberOption(option: SlashCommandIntegerOption, select: MessageSelector): SlashCommandIntegerOption {
  return describe(option.setName('number'), select).setRequired(true).setMinValue(1).setMaxValue(CASE_NUMBER_MAX);
}

export const modCase: Command = {
  data: createCommand('case', (m) => m.commands.case.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      describe(sub.setName('view'), (m) => m.commands.case.view.description).addIntegerOption((option) =>
        numberOption(option, (m) => m.commands.case.view.number),
      ),
    )
    .addSubcommand((sub) =>
      describe(sub.setName('reason'), (m) => m.commands.case.reason.description)
        .addIntegerOption((option) => numberOption(option, (m) => m.commands.case.reason.number))
        .addStringOption((option) => reasonOption(option, (m) => m.commands.case.reason.reason, true)),
    )
    .addSubcommand((sub) =>
      describe(sub.setName('delete'), (m) => m.commands.case.delete.description).addIntegerOption((option) =>
        numberOption(option, (m) => m.commands.case.delete.number),
      ),
    ),
  category: 'moderation',
  cooldownSeconds: 2,
  async execute({ interaction, client, t }) {
    const { guildId } = interaction;
    const subcommand = interaction.options.getSubcommand();
    // A4: deleting a case needs Manage Server; viewing and editing need Timeout Members.
    const permission = subcommand === 'delete' ? 'ManageGuild' : 'ModerateMembers';
    if (!invokerHas(interaction, permission)) {
      await replyError(interaction, t.moderation.invokerMissing(t.permissions[permission]));
      return;
    }
    // Re-check of the option range: an out-of-range number never reaches Postgres (repo input rule).
    const caseNumber = parseCaseNumber(interaction.options.getInteger('number', true));
    if (caseNumber === null) {
      await replyError(interaction, t.moderation.caseNotFound);
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { cases } = client.storage;

    switch (subcommand) {
      case 'view': {
        const found = await cases.get(guildId, caseNumber);
        if (!found.ok) {
          await replyError(interaction, t.moderation.storageUnavailable);
          return;
        }
        if (found.value === null) {
          await replyError(interaction, t.moderation.caseNotFound);
          return;
        }
        await interaction.editReply({ embeds: [buildCaseEmbed(t, found.value)], allowedMentions: { parse: [] } });
        return;
      }
      case 'reason': {
        const updated = await cases.updateReason(guildId, caseNumber, readReason(interaction));
        if (!updated.ok) {
          await replyError(interaction, t.moderation.storageUnavailable);
          return;
        }
        if (updated.value === null) {
          await replyError(interaction, t.moderation.caseNotFound);
          return;
        }
        await editModLog(client, updated.value, buildCaseEmbed(t, updated.value));
        await replyInfo(interaction, t.moderation.caseReasonUpdated(caseNumber));
        return;
      }
      case 'delete': {
        // The mod-log message stays (A3); the number is never handed out again.
        const deleted = await cases.delete(guildId, caseNumber);
        if (!deleted.ok) {
          await replyError(interaction, t.moderation.storageUnavailable);
          return;
        }
        if (!deleted.value) {
          await replyError(interaction, t.moderation.caseNotFound);
          return;
        }
        await replyInfo(interaction, t.moderation.caseDeleted(caseNumber));
        return;
      }
      default:
        await replyError(interaction, t.errors.unknownCommand);
    }
  },
};
