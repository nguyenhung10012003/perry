import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import type { EmbedBuilder, GuildTextBasedChannel } from 'discord.js';
import type { Player } from 'lavalink-client';
import type { Messages } from '../i18n/index.js';
import { safeError } from '../utils/errors.js';
import { baseEmbed, infoEmbed } from '../utils/embeds.js';
import type { GuildMusicState, NowPlayingRef } from './guild-state.js';
import { formatDuration, progressBar, trackLink } from './format.js';
import type { MusicService } from './music-service.js';
import { getRequester, isAutoplayTrack } from './requester.js';

/** Minimum gap between two edits of the Now-Playing message (plan D18). */
const MIN_EDIT_INTERVAL_MS = 1000;
const NO_MENTIONS = { parse: [] as never[] };

export const NP_PREFIX = 'np:';
export type NpAction = 'pause' | 'skip' | 'stop' | 'loop' | 'shuffle' | 'queue';

export interface NowPlayingPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  allowedMentions: typeof NO_MENTIONS;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** Resolves a text channel the bot can post embeds in; logs a single warning per guild when it cannot. */
function resolveWritableChannel(
  service: MusicService,
  channelId: string | null | undefined,
  state?: GuildMusicState,
): GuildTextBasedChannel | null {
  if (!channelId) return null;
  const channel = service.client.channels.cache.get(channelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return null;
  const me = channel.guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  const canSend = channel.isThread()
    ? PermissionFlagsBits.SendMessagesInThreads
    : PermissionFlagsBits.SendMessages;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks, canSend])) {
    if (state && !state.npPermissionWarned) {
      state.npPermissionWarned = true;
      service.logger.warn({ guildId: channel.guild.id, channelId }, 'Cannot post in the music text channel');
    }
    return null;
  }
  return channel;
}

/** Posts a short informational notice in the guild's language (best effort, never throws). */
export async function sendNotice(
  service: MusicService,
  channelId: string | null | undefined,
  text: (t: Messages) => string,
): Promise<void> {
  const channel = resolveWritableChannel(service, channelId);
  if (!channel) return;
  try {
    const t = await service.client.messagesFor(channel.guild.id);
    await channel.send({ embeds: [infoEmbed(text(t))], allowedMentions: NO_MENTIONS });
  } catch (err) {
    service.logger.debug({ err: safeError(err) }, 'Could not send notice');
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Builds the Now-Playing embed and button rows (in the given catalog) for the current track, or null when idle. */
export function buildNowPlaying(player: Player, t: Messages, state?: GuildMusicState): NowPlayingPayload | null {
  const track = player.queue.current;
  if (!track) return null;
  const info = track.info;
  const requester = getRequester(track);
  const botId = player.LavalinkManager.options.client?.id;
  const requesterText =
    isAutoplayTrack(track)
      ? t.nowPlaying.autoplayRequester
      : requester && requester.id !== botId && /^\d{15,25}$/.test(requester.id)
        ? `<@${requester.id}>`
        : t.nowPlaying.unknownRequester;

  const timeline = info.isStream
    ? t.nowPlaying.live
    : `${progressBar(player.position, info.duration)}\n\`${formatDuration(player.position)} / ${formatDuration(info.duration)}\``;

  const embed = baseEmbed()
    .setTitle(t.nowPlaying.title)
    .setDescription(`**${trackLink(info.title, info.uri, 120)}**\n${timeline}`)
    .addFields(
      { name: t.nowPlaying.author, value: info.author.length > 0 ? info.author.slice(0, 256) : '-', inline: true },
      { name: t.nowPlaying.requestedBy, value: requesterText, inline: true },
      { name: t.nowPlaying.loop, value: t.music.loopModes[player.repeatMode], inline: true },
      { name: t.nowPlaying.volume, value: `${player.volume}%`, inline: true },
    );
  if (state?.activeFilter) {
    embed.addFields({ name: t.nowPlaying.filter, value: t.filters.names[state.activeFilter], inline: true });
  }
  if (info.artworkUrl && /^https?:\/\//i.test(info.artworkUrl)) embed.setThumbnail(info.artworkUrl);

  return { embeds: [embed], components: buildButtons(player, t), allowedMentions: NO_MENTIONS };
}

function buildButtons(player: Player, t: Messages): ActionRowBuilder<ButtonBuilder>[] {
  const button = (action: NpAction, label: string, emoji: string, style = ButtonStyle.Secondary): ButtonBuilder =>
    new ButtonBuilder().setCustomId(`${NP_PREFIX}${action}`).setLabel(label).setEmoji(emoji).setStyle(style);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button('pause', player.paused ? t.buttons.resume : t.buttons.pause, player.paused ? '▶️' : '⏸️'),
      button('skip', t.buttons.skip, '⏭️'),
      button('stop', t.buttons.stop, '⏹️', ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button('loop', t.buttons.loop, '🔁', player.repeatMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
      button('shuffle', t.buttons.shuffle, '🔀'),
      button('queue', t.buttons.queue, '📜'),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Serialised send / edit / cleanup (plan D18)
// ---------------------------------------------------------------------------

/** Appends a task to the guild's Now-Playing chain; a failing task never breaks the chain. */
function enqueue(service: MusicService, state: GuildMusicState, task: () => Promise<void>): void {
  const next = state.npQueue.then(task).catch((err: unknown) => {
    service.logger.debug({ err: safeError(err), guildId: state.guildId }, 'Now-Playing task failed');
  });
  state.npQueue = next;
  service.track(next);
}

async function deleteMessage(service: MusicService, ref: NowPlayingRef): Promise<void> {
  const channel = service.client.channels.cache.get(ref.channelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return;
  await channel.messages.delete(ref.messageId).catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * On trackStart: deletes the previous Now-Playing message (best effort) and posts a fresh one
 * in the player's text channel.
 */
export function sendNowPlaying(service: MusicService, player: Player): void {
  const state = service.getState(player.guildId);
  if (!state || state.disposed) return;
  enqueue(service, state, async () => {
    // Resolved inside the task so the message uses the guild's language at the time it is rendered.
    const t = await service.client.messagesFor(player.guildId);
    if (state.disposed) return;
    const previous = state.npMessage;
    if (previous) {
      state.npMessage = null;
      await deleteMessage(service, previous);
    }
    const payload = buildNowPlaying(player, t, state);
    if (!payload) return;
    const channel = resolveWritableChannel(service, player.textChannelId, state);
    if (!channel) return;
    const message = await channel.send(payload);
    state.npMessage = { messageId: message.id, channelId: channel.id, ended: false };
    state.lastNpEdit = Date.now();
  });
}

/**
 * Re-renders the current Now-Playing message (pause label, loop, volume, filter...).
 * Edits are throttled to one per second and rapid calls are coalesced.
 */
export function refreshNowPlaying(service: MusicService, guildId: string): void {
  const state = service.getState(guildId);
  if (!state || state.disposed || !state.npMessage || state.npMessage.ended || state.npRefreshQueued) return;
  state.npRefreshQueued = true;
  enqueue(service, state, async () => {
    state.npRefreshQueued = false;
    const wait = MIN_EDIT_INTERVAL_MS - (Date.now() - state.lastNpEdit);
    if (wait > 0) await sleep(wait);
    // Resolved inside the task, so a /settings language change re-renders in the new language.
    const t = await service.client.messagesFor(guildId);
    const ref = state.npMessage;
    const player = service.getPlayer(guildId);
    if (!ref || ref.ended || !player || state.disposed) return;
    const payload = buildNowPlaying(player, t, state);
    const channel = service.client.channels.cache.get(ref.channelId);
    if (!payload || !channel?.isTextBased() || channel.isDMBased()) return;
    state.lastNpEdit = Date.now();
    await channel.messages.edit(ref.messageId, payload);
  });
}

/** Removes the buttons from the Now-Playing message and marks it ended (queue end, stop, destroy). */
export function endNowPlaying(service: MusicService, state: GuildMusicState): void {
  enqueue(service, state, async () => {
    const ref = state.npMessage;
    if (!ref || ref.ended) return;
    ref.ended = true;
    const channel = service.client.channels.cache.get(ref.channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    await channel.messages.edit(ref.messageId, { components: [] });
  });
}
