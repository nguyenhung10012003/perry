import { RECENT_MAX_MEMBERS } from '../../config/constants.js';
import type { RecentlyPlayedStore } from '../types.js';

/** Bounded per-guild recently-played keys kept in memory (oldest dropped first). */
export class MemoryRecentlyPlayedStore implements RecentlyPlayedStore {
  private readonly byGuild = new Map<string, string[]>();

  add(guildId: string, trackKeys: readonly string[]): Promise<void> {
    const keys = this.byGuild.get(guildId) ?? [];
    for (const key of trackKeys) {
      const existing = keys.indexOf(key);
      if (existing !== -1) keys.splice(existing, 1);
      keys.push(key);
    }
    if (keys.length > RECENT_MAX_MEMBERS) keys.splice(0, keys.length - RECENT_MAX_MEMBERS);
    this.byGuild.set(guildId, keys);
    return Promise.resolve();
  }

  keys(guildId: string): Promise<Set<string>> {
    return Promise.resolve(new Set(this.byGuild.get(guildId) ?? []));
  }

  clear(guildId: string): Promise<void> {
    this.byGuild.delete(guildId);
    return Promise.resolve();
  }
}
