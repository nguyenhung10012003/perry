import { playHistory } from './schema.js';
import type { Database } from './client.js';

export interface PlayHistoryEntry {
  guildId: string;
  identifier: string | null;
  sourceName: string | null;
  title: string | null;
  author: string | null;
  durationMs: number | null;
  requesterId: string | null;
  discoveryProvider: string | null;
}

/** Appends one row to play_history. Callers decide whether history is enabled (PLAY_HISTORY). */
export async function recordPlay(db: Database, entry: PlayHistoryEntry): Promise<void> {
  await db.insert(playHistory).values(entry);
}
