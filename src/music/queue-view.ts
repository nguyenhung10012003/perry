import type { EmbedBuilder } from 'discord.js';
import type { Player } from 'lavalink-client';
import { QUEUE_PAGE_SIZE } from '../config/constants.js';
import { t } from '../i18n/index.js';
import { baseEmbed } from '../utils/embeds.js';
import { formatDuration, trackLink } from './format.js';
import { getRequester } from './requester.js';

export interface QueuePage {
  embed: EmbedBuilder;
  /** The page actually rendered (the requested one is clamped). */
  page: number;
  totalPages: number;
}

function requesterSuffix(id: string | undefined, botId: string | undefined): string {
  return id && id !== botId && /^\d{15,25}$/.test(id) ? ` • <@${id}>` : '';
}

/** Builds one page of the queue. Always reads the live queue, so re-rendering after changes is safe. */
export function buildQueuePage(player: Player, requestedPage: number): QueuePage {
  const upcoming = player.queue.tracks;
  const totalPages = Math.max(1, Math.ceil(upcoming.length / QUEUE_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), totalPages);
  const botId = player.LavalinkManager.options.client?.id;

  const sections: string[] = [];
  const current = player.queue.current;
  if (current) {
    const duration = current.info.isStream ? t.nowPlaying.live : formatDuration(current.info.duration ?? 0);
    sections.push(
      `**${t.queue.current}**\n${trackLink(current.info.title, current.info.uri, 70)} \`${duration}\`${requesterSuffix(getRequester(current)?.id, botId)}`,
    );
  }

  if (upcoming.length === 0) {
    sections.push(t.queue.empty);
  } else {
    const start = (page - 1) * QUEUE_PAGE_SIZE;
    const lines = upcoming.slice(start, start + QUEUE_PAGE_SIZE).map((track, offset) => {
      const duration = track.info.isStream ? t.nowPlaying.live : formatDuration(track.info.duration ?? 0);
      return `\`${start + offset + 1}.\` ${trackLink(track.info.title, track.info.uri, 60)} \`${duration}\`${requesterSuffix(getRequester(track)?.id, botId)}`;
    });
    sections.push(`**${t.queue.upNext}**\n${lines.join('\n')}`);
  }

  const embed = baseEmbed()
    .setTitle(t.queue.title)
    .setDescription(sections.join('\n\n'))
    .setFooter({
      text: t.queue.footer(
        page,
        totalPages,
        upcoming.length,
        formatDuration(player.queue.utils.totalDuration()),
        t.music.loopModes[player.repeatMode],
      ),
    });
  return { embed, page, totalPages };
}
