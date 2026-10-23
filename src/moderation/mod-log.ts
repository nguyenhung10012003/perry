import { DiscordAPIError, escapeMarkdown } from 'discord.js';
import type { EmbedBuilder } from 'discord.js';
import type { BotClient } from '../client/bot-client.js';
import type { Messages } from '../i18n/index.js';
import { truncate } from '../music/format.js';
import type { ModCase } from '../storage/types.js';
import { postableTextChannel } from '../utils/channels.js';
import { baseEmbed } from '../utils/embeds.js';
import { safeError } from '../utils/errors.js';
import { formatDuration } from './duration.js';
import type { ModAction } from './target-check.js';

const FIELD_MAX = 1024;
const TAG_MAX = 64;
const UNKNOWN_MESSAGE = 10_008;
const NO_MENTIONS = { parse: [] as never[] };

/** Actions that DM the target (A2: no DM on unban or timeout removal). */
export const DM_ACTIONS: ReadonlySet<ModAction> = new Set<ModAction>(['ban', 'kick', 'timeout', 'warn']);

/** A recorded case, or the same data with caseNumber null when the case could not be saved. */
export type CaseEmbedInput = Pick<
  ModCase,
  'action' | 'targetId' | 'targetTag' | 'moderatorId' | 'moderatorTag' | 'reason' | 'durationSeconds' | 'dmSent' | 'createdAt'
> & { caseNumber: number | null };

export interface CaseEmbedExtras {
  /** DM result of the action just taken ('off': DMs are disabled); derived from dmSent when omitted. */
  dm?: 'sent' | 'failed' | 'off';
}

export interface PurgeEmbedInput {
  channelId: string;
  moderatorId: string;
  moderatorTag: string;
  count: number;
  /** The user filter of /purge, if any. */
  user: { id: string; tag: string } | null;
}

/** An escaped, truncated user tag for message text. */
export function displayTag(tag: string): string {
  return escapeMarkdown(truncate(tag, TAG_MAX));
}

function userField(id: string, tag: string | null): string {
  return tag ? `<@${id}> (${displayTag(tag)})` : `<@${id}>`;
}

/** The embed of one case, for the mod log and /case view, in the given catalog. */
export function buildCaseEmbed(t: Messages, modCase: CaseEmbedInput, extras: CaseEmbedExtras = {}): EmbedBuilder {
  const labels = t.moderation.log;
  const embed = baseEmbed()
    .setTitle(labels.caseTitle(t.moderation.actions[modCase.action], modCase.caseNumber))
    .addFields(
      { name: labels.target, value: userField(modCase.targetId, modCase.targetTag), inline: true },
      { name: labels.moderator, value: userField(modCase.moderatorId, modCase.moderatorTag), inline: true },
    )
    .setTimestamp(modCase.createdAt);
  if (modCase.durationSeconds !== null) {
    embed.addFields({ name: labels.duration, value: formatDuration(modCase.durationSeconds * 1000), inline: true });
  }
  embed.addFields({
    name: labels.reason,
    value: modCase.reason ? truncate(escapeMarkdown(modCase.reason), FIELD_MAX) : labels.noReason,
  });
  if (DM_ACTIONS.has(modCase.action)) {
    const dm = extras.dm ?? (modCase.dmSent ? 'sent' : 'failed');
    const value = dm === 'sent' ? labels.dmSent : dm === 'off' ? labels.dmOff : labels.dmNotSent;
    embed.addFields({ name: labels.dm, value, inline: true });
  }
  if (modCase.caseNumber === null) embed.setDescription(labels.notRecorded);
  return embed;
}

/** The mod-log embed of a /purge (no case is created, A5). */
export function buildPurgeEmbed(t: Messages, purge: PurgeEmbedInput): EmbedBuilder {
  const labels = t.moderation.log;
  const embed = baseEmbed()
    .setTitle(labels.purgeTitle)
    .addFields(
      { name: labels.channel, value: `<#${purge.channelId}>`, inline: true },
      { name: labels.moderator, value: userField(purge.moderatorId, purge.moderatorTag), inline: true },
      { name: labels.count, value: String(purge.count), inline: true },
    )
    .setTimestamp(new Date());
  if (purge.user) embed.addFields({ name: labels.userFilter, value: userField(purge.user.id, purge.user.tag) });
  return embed;
}

/** Guilds whose mod-log failure was already logged at warn level in this process. */
const warnedGuilds = new Set<string>();

function logFailure(client: BotClient, guildId: string, details: Record<string, unknown>, message: string): void {
  if (warnedGuilds.has(guildId)) {
    client.logger.debug({ ...details, guildId }, message);
    return;
  }
  warnedGuilds.add(guildId);
  client.logger.warn({ ...details, guildId }, message);
}

/** Posts to the guild's mod-log channel. Returns the message reference, or null (not configured or failed). */
export async function postModLog(
  client: BotClient,
  guildId: string,
  embed: EmbedBuilder,
): Promise<{ channelId: string; messageId: string } | null> {
  const { modLogChannelId } = await client.settings.get(guildId);
  if (!modLogChannelId) return null;
  const channel = postableTextChannel(client, modLogChannelId);
  if (!channel) {
    logFailure(client, guildId, { channelId: modLogChannelId }, 'Cannot post in the mod-log channel');
    return null;
  }
  try {
    const message = await channel.send({ embeds: [embed], allowedMentions: NO_MENTIONS });
    return { channelId: channel.id, messageId: message.id };
  } catch (err) {
    logFailure(client, guildId, { err: safeError(err), channelId: channel.id }, 'Could not post to the mod-log channel');
    return null;
  }
}

/** Edits the logged embed of a case (after /case reason). A deleted message (10008) is ignored. */
export async function editModLog(client: BotClient, modCase: ModCase, embed: EmbedBuilder): Promise<void> {
  const { logChannelId, logMessageId } = modCase;
  if (!logChannelId || !logMessageId) return;
  const channel = client.channels.cache.get(logChannelId);
  if (!channel?.isTextBased() || channel.isDMBased()) {
    logFailure(client, modCase.guildId, { channelId: logChannelId }, 'The mod-log channel of a case is gone');
    return;
  }
  try {
    await channel.messages.edit(logMessageId, { embeds: [embed], allowedMentions: NO_MENTIONS });
  } catch (err) {
    if (err instanceof DiscordAPIError && err.code === UNKNOWN_MESSAGE) {
      client.logger.debug({ guildId: modCase.guildId, channelId: logChannelId }, 'The mod-log message was deleted');
      return;
    }
    logFailure(client, modCase.guildId, { err: safeError(err), channelId: logChannelId }, 'Could not edit the mod-log message');
  }
}
