import type { LyricsResult, Player } from 'lavalink-client';
import { safeError } from '../utils/errors.js';
import type { MusicService } from './music-service.js';

export const LYRICS_PAGE_SIZE = 3800;

export type LyricsOutcome =
  | { kind: 'ok'; pages: string[]; synced: boolean; source: string | null }
  | { kind: 'unsupported' }
  | { kind: 'notFound' }
  | { kind: 'failed' };

/** Splits text into pages of at most `size` characters, preferring line boundaries. */
export function splitLyrics(text: string, size = LYRICS_PAGE_SIZE): string[] {
  const pages: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current.trim().length > 0) pages.push(current.trim());
    current = '';
  };
  for (const rawLine of text.split(/\r?\n/)) {
    // A single very long line is hard-split.
    for (let start = 0; start === 0 || start < rawLine.length; start += size) {
      const line = rawLine.slice(start, start + size);
      if (current.length + line.length + 1 > size) flush();
      current += `${line}\n`;
    }
  }
  flush();
  return pages;
}

function lyricsText(result: LyricsResult): string {
  if (typeof result.text === 'string' && result.text.trim().length > 0) return result.text;
  if (Array.isArray(result.lines)) {
    return result.lines
      .map((line) => line.line)
      .filter((line) => typeof line === 'string')
      .join('\n');
  }
  return '';
}

/**
 * Fetches lyrics for the current track. Lyrics depend on the LavaLyrics plugin and external services,
 * so every failure is mapped to an outcome and nothing is thrown to the caller.
 */
export async function fetchLyrics(service: MusicService, player: Player): Promise<LyricsOutcome> {
  try {
    const plugins = player.node.info?.plugins;
    if (!plugins?.some((plugin) => plugin.name === 'lavalyrics-plugin')) return { kind: 'unsupported' };
    const result: unknown = await player.getCurrentLyrics(false);
    if (typeof result !== 'object' || result === null) return { kind: 'notFound' };
    const candidate = result as Partial<LyricsResult> & { status?: unknown };
    // Lavalink answers REST failures with an error object ({ status, error, message, ... }).
    if (typeof candidate.status === 'number') return { kind: 'failed' };
    const text = lyricsText(candidate as LyricsResult);
    if (text.trim().length === 0) return { kind: 'notFound' };
    const synced = !(typeof candidate.text === 'string' && candidate.text.trim().length > 0);
    return {
      kind: 'ok',
      pages: splitLyrics(text),
      synced,
      source: typeof candidate.sourceName === 'string' && candidate.sourceName.length > 0 ? candidate.sourceName : null,
    };
  } catch (err) {
    service.logger.debug({ err: safeError(err) }, 'Lyrics lookup failed');
    // lavalink-client throws for HTTP 404, which LavaLyrics uses for "no lyrics found".
    if (err instanceof Error && err.message.includes('Node Request resulted into an error')) {
      return { kind: 'notFound' };
    }
    return { kind: 'failed' };
  }
}
