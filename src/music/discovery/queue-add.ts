import type { Track, UnresolvedTrack } from 'lavalink-client';
import { MAX_QUEUE_SIZE } from '../../config/constants.js';

/** The part of a Player the queue-add path reads (a missing player means an empty queue). */
export interface QueueLike {
  queue: {
    current: Track | null;
    tracks: (Track | UnresolvedTrack)[];
  };
}

export interface AdditionPlan {
  /** Tracks to add, in their original order. */
  toAdd: Track[];
  /** Tracks skipped because they are already queued or repeat inside the batch (only counted when `dedupe`). */
  duplicates: number;
  /** Tracks dropped because the queue is full (MAX_QUEUE_SIZE counts the current track and the upcoming ones). */
  trimmedByQueueCap: number;
}

/** Identity of a track for de-duplication: `${sourceName}:${identifier}`. */
export function trackKey(track: Pick<Track, 'info'>): string {
  return `${track.info.sourceName}:${track.info.identifier}`;
}

/** Like trackKey for queue entries, which may be unresolved (null when source or identifier is unknown). */
export function queueEntryKey(track: Track | UnresolvedTrack): string | null {
  const { sourceName, identifier } = track.info;
  return sourceName && identifier ? `${sourceName}:${identifier}` : null;
}

/** Number of tracks that count against MAX_QUEUE_SIZE (current + upcoming). */
export function usedQueueSlots(player: QueueLike | undefined): number {
  if (!player) return 0;
  return player.queue.tracks.length + (player.queue.current ? 1 : 0);
}

/** How many more tracks fit into the queue (never negative). */
export function remainingQueueCapacity(player: QueueLike | undefined): number {
  return Math.max(0, MAX_QUEUE_SIZE - usedQueueSlots(player));
}

/**
 * Shared queue-add path: decides which of `tracks` get queued. With `dedupe`, tracks already queued (current +
 * upcoming) and repeats inside the batch are skipped first; then the queue cap trims the rest.
 * Pure: it never touches the player.
 */
export function planAdditions(
  player: QueueLike | undefined,
  tracks: readonly Track[],
  options: { dedupe: boolean },
): AdditionPlan {
  let candidates: Track[] = [...tracks];
  let duplicates = 0;
  if (options.dedupe) {
    const seen = new Set<string>();
    if (player) {
      for (const entry of [player.queue.current, ...player.queue.tracks]) {
        const key = entry ? queueEntryKey(entry) : null;
        if (key) seen.add(key);
      }
    }
    candidates = [];
    for (const track of tracks) {
      const key = trackKey(track);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      candidates.push(track);
    }
  }
  const toAdd = candidates.slice(0, remainingQueueCapacity(player));
  return { toAdd, duplicates, trimmedByQueueCap: candidates.length - toAdd.length };
}
