import { DiscordAPIError, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { MOD_PURGE_MAX } from '../../config/constants.js';
import { buildPurgeEmbed, postModLog } from '../../moderation/mod-log.js';
import { invokerHas, missingChannelPermissions } from '../../moderation/permissions.js';
import type { Command } from '../../types/command.js';
import { safeError } from '../../utils/errors.js';
import { replyError, replyInfo } from '../../utils/respond.js';
import { createCommand, describe } from '../builder.js';
import { fetchMe } from './shared.js';

/** Discord bulk-deletes only messages younger than 14 days; keep a minute of margin for clock skew. */
const BULK_DELETE_MAX_AGE_MS = 14 * 86_400_000 - 60_000;
/** Missing Permissions / message too old for bulk delete. */
const PURGE_REFUSED_CODES = new Set([50_013, 50_034]);

export const purge: Command = {
  data: createCommand('purge', (m) => m.commands.purge.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      describe(option.setName('amount'), (m) => m.commands.purge.amount)
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(MOD_PURGE_MAX),
    )
    .addUserOption((option) => describe(option.setName('user'), (m) => m.commands.purge.user)),
  category: 'moderation',
  cooldownSeconds: 5,
  async execute({ interaction, client, t }) {
    if (!invokerHas(interaction, 'ManageMessages')) {
      await replyError(interaction, t.moderation.invokerMissing(t.permissions.ManageMessages));
      return;
    }
    const amount = Math.min(Math.max(1, interaction.options.getInteger('amount', true)), MOD_PURGE_MAX);
    const filterUser = interaction.options.getUser('user');
    // The cache getter is null for uncached threads, so fall back to a fetch.
    const channel =
      interaction.channel ?? (await client.channels.fetch(interaction.channelId).catch(() => null));
    if (!channel?.isTextBased() || channel.isDMBased()) {
      await replyError(interaction, t.moderation.purgeNoAccess);
      return;
    }
    const me = await fetchMe(interaction.guild);
    const missing = missingChannelPermissions(channel, me, ['ViewChannel', 'ReadMessageHistory', 'ManageMessages']);
    if (missing.length > 0) {
      await replyError(interaction, t.moderation.botMissing(missing.map((key) => t.permissions[key])));
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let deleted: number;
    try {
      const recent = await channel.messages.fetch({ limit: MOD_PURGE_MAX });
      const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;
      const ids = [...recent.values()]
        .filter((message) => !message.pinned && message.createdTimestamp > cutoff)
        .filter((message) => filterUser === null || message.author.id === filterUser.id)
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
        .slice(0, amount)
        .map((message) => message.id);
      deleted = ids.length > 0 ? (await channel.bulkDelete(ids, true)).size : 0;
    } catch (err) {
      if (!(err instanceof DiscordAPIError) || typeof err.code !== 'number' || !PURGE_REFUSED_CODES.has(err.code)) {
        throw err;
      }
      client.logger.warn({ err: safeError(err), guildId: interaction.guildId }, 'Discord refused a purge');
      await replyError(interaction, t.moderation.purgeNoAccess);
      return;
    }

    // A purge writes a mod-log entry but no case (A5).
    await postModLog(
      client,
      interaction.guildId,
      buildPurgeEmbed(t, {
        channelId: channel.id,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        count: deleted,
        user: filterUser ? { id: filterUser.id, tag: filterUser.tag } : null,
      }),
    );
    const lines = [t.moderation.purged(deleted)];
    if (deleted < amount) lines.push(t.moderation.purgeSkipped(amount - deleted));
    await replyInfo(interaction, lines.join('\n'));
  },
};
