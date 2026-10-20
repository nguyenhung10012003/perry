import type { Track } from "lavalink-client";
import { trackKey } from "./queue-add.js";

/** Pure helpers of the discovery pipeline: name normalisation, candidate filters, artist diversity, caps. */

const BRACKET_GROUPS = /\([^()]*\)|\[[^[\]]*\]|\{[^{}]*\}|【[^】]*】/gu;
const TITLE_SEPARATOR = /\s+[-–—]\s+/u;

/** Lowercase, accents removed (Vietnamese included), only letters and digits kept. */
function squash(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/giu, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Channel name without "- Topic", "VEVO" and "Official" decorations, for display and search queries. */
export function cleanArtist(author: string): string {
  return author
    .replace(BRACKET_GROUPS, " ")
    .replace(/\s+-\s+topic\s*$/iu, "")
    .replace(/vevo\s*$/iu, "")
    .replace(/\s+official(\s+(channel|music|artist))?\s*$/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Title without (...) / [...] groups and without a leading "Artist - " part, for display and search queries. */
export function cleanTitle(title: string, author = ""): string {
  let text = title.replace(BRACKET_GROUPS, " ").replace(/\s+/gu, " ").trim();
  const separator = TITLE_SEPARATOR.exec(text);
  if (separator) {
    const head = text.slice(0, separator.index);
    const rest = text.slice(separator.index + separator[0].length).trim();
    const artist = normArtist(author);
    const headKey = squash(head);
    if (
      rest !== "" &&
      artist !== "" &&
      headKey !== "" &&
      (headKey === artist ||
        artist.includes(headKey) ||
        headKey.includes(artist))
    ) {
      text = rest;
    }
  }
  return text;
}

/** Comparison form of an artist / channel name. */
export function normArtist(author: string): string {
  return squash(cleanArtist(author));
}

/** Comparison form of a title (brackets and a leading artist part removed). */
export function normTitle(title: string, author = ""): string {
  return squash(cleanTitle(title, author));
}

/** `artist|title` identity that survives re-uploads of the same song by different channels of the same artist. */
export function titleKey(track: Pick<Track, "info">): string {
  return `${normArtist(track.info.author)}|${normTitle(track.info.title, track.info.author)}`;
}

/** Both identities of a track; this is what the recently-played store remembers. */
export function recentKeys(track: Pick<Track, "info">): string[] {
  return [trackKey(track), titleKey(track)];
}

export interface FilterOptions {
  minDurationMs: number;
  maxDurationMs: number;
  /** Keys that must not come back (queue, previous tracks, recently played, the seed). */
  blocked: ReadonlySet<string>;
}

/**
 * Drops streams, tracks outside the duration window, blocked tracks and repeats inside the batch.
 * Keeps the order of the survivors.
 */
export function filterCandidates(
  tracks: readonly Track[],
  options: FilterOptions,
): Track[] {
  const seen = new Set<string>();
  const kept: Track[] = [];
  for (const track of tracks) {
    const { isStream, duration } = track.info;
    if (isStream) continue;
    if (
      !Number.isFinite(duration) ||
      duration < options.minDurationMs ||
      duration > options.maxDurationMs
    )
      continue;
    const idKey = trackKey(track);
    const nameKey = titleKey(track);
    if (options.blocked.has(idKey) || options.blocked.has(nameKey)) continue;
    if (seen.has(idKey) || seen.has(nameKey)) continue;
    seen.add(idKey);
    seen.add(nameKey);
    kept.push(track);
  }
  return kept;
}

/**
 * Stable greedy reorder: no artist appears more than `maxRun` times in a row, counting `tailArtists` (normalised
 * artists at the end of the existing queue, oldest first). Best effort: it never drops a track; when only one
 * artist is left the leftovers keep their order.
 */
export function diversify(
  tracks: readonly Track[],
  tailArtists: readonly string[],
  maxRun: number,
): Track[] {
  const pending = tracks.map((track) => ({
    track,
    artist: normArtist(track.info.author),
  }));
  let lastArtist = "";
  let run = 0;
  for (const artist of tailArtists) {
    if (artist !== "" && artist === lastArtist) run++;
    else {
      lastArtist = artist;
      run = artist === "" ? 0 : 1;
    }
  }
  const result: Track[] = [];
  while (pending.length > 0) {
    let index = pending.findIndex(
      (entry) =>
        entry.artist === "" || entry.artist !== lastArtist || run < maxRun,
    );
    if (index < 0) index = 0;
    const [entry] = pending.splice(index, 1);
    if (!entry) break;
    result.push(entry.track);
    if (entry.artist !== "" && entry.artist === lastArtist) run++;
    else {
      lastArtist = entry.artist;
      run = entry.artist === "" ? 0 : 1;
    }
  }
  return result;
}

/** First `limit` tracks (never negative). */
export function capTracks(tracks: readonly Track[], limit: number): Track[] {
  return tracks.slice(0, Math.max(0, Math.floor(limit)));
}
