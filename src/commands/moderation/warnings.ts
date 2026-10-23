import { escapeMarkdown, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { MOD_CASES_PAGE_SIZE } from '../../config/constants.js';
import { clampPage } from '../../moderation/limits.js';
import { displayTag } from '../../moderation/mod-log.js';
import { invokerHas } from '../../moderation/permissions.js';
import { truncate } from '../../music/format.js';
import type { Command } from '../../types/command.js';
import { baseEmbed } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
import type { PageContent } from '../../utils/pagination.js';
import { paginate } from '../../utils/pagination.js';
import { replyError, replyInfo } from '../../utils/respond.js';
import { createCommand, describe } from '../builder.js';
import { userOption } from './shared.js';

const REASON_PREVIEW_MAX = 80;

export const warnings: Command = {
  data: createCommand('warnings', (m) => m.commands.warnings.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      describe(sub.setName('list'), (m) => m.commands.warnings.list.description).addUserOption((option) =>
        userOption(option, (m) => m.commands.warnings.list.user),
      ),
    )
    .addSubcommand((sub) =>
      describe(sub.setName('clear'), (m) => m.commands.warnings.clear.description).addUserOption((option) =>
        userOption(option, (m) => m.commands.warnings.clear.user),
      ),
    ),
  category: 'moderation',
  cooldownSeconds: 3,
  async execute({ interaction, client, t }) {
    const { guildId } = interaction;
    // Not necessarily a member: the warnings of a user who left stay listed (A9).
    const user = interaction.options.getUser('user', true);
    const { cases } = client.storage;

    if (interaction.options.getSubcommand() === 'clear') {
      // A4: deleting records needs Manage Server, more than the command's default permission.
      if (!invokerHas(interaction, 'ManageGuild')) {
        await replyError(interaction, t.moderation.invokerMissing(t.permissions.ManageGuild));
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const cleared = await cases.clearWarnings(guildId, user.id);
      if (!cleared.ok) {
        await replyError(interaction, t.moderation.storageUnavailable);
        return;
      }
      await replyInfo(interaction, t.moderation.warningsCleared(displayTag(user.tag), cleared.value));
      return;
    }

    if (!invokerHas(interaction, 'ModerateMembers')) {
      await replyError(interaction, t.moderation.invokerMissing(t.permissions.ModerateMembers));
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const load = async (page: number) => {
      const result = await cases.listForUser(guildId, user.id, {
        action: 'warn',
        offset: (page - 1) * MOD_CASES_PAGE_SIZE,
        limit: MOD_CASES_PAGE_SIZE,
      });
      if (!result.ok) throw new UserError((m) => m.moderation.storageUnavailable);
      return result.value;
    };
    const render = async (requested: number): Promise<PageContent> => {
      let page = clampPage(requested, Number.MAX_SAFE_INTEGER);
      let { cases: rows, total } = await load(page);
      let totalPages = Math.max(1, Math.ceil(total / MOD_CASES_PAGE_SIZE));
      // A page past the end (warnings deleted meanwhile) shows the last page.
      const last = clampPage(page, totalPages);
      if (last !== page) {
        page = last;
        ({ cases: rows, total } = await load(page));
        totalPages = Math.max(1, Math.ceil(total / MOD_CASES_PAGE_SIZE));
      }
      const lines = rows.map((c) => {
        const reason = c.reason ? escapeMarkdown(truncate(c.reason, REASON_PREVIEW_MAX)) : t.moderation.log.noReason;
        const when = Math.floor(c.createdAt.getTime() / 1000);
        return `#${c.caseNumber} · ${t.moderation.actions[c.action]} · <t:${when}:R> · ${reason}`;
      });
      const embed = baseEmbed()
        .setTitle(t.moderation.warnings.title(displayTag(user.tag)))
        .setDescription(lines.length > 0 ? lines.join('\n') : t.moderation.warnings.empty)
        .setFooter({ text: t.moderation.warnings.footer(page, totalPages, total) });
      return { embed, page, totalPages };
    };
    await paginate(interaction, render, t);
  },
};
