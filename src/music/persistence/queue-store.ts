import type { QueueStoreManager, StoredQueue } from 'lavalink-client';

/**
 * lavalink-client queue store used as the change-notification seam for snapshots.
 *
 * - The manager validates `Object.getOwnPropertyNames(Object.getPrototypeOf(store))`, so get/set/stringify/
 *   parse/delete are declared on this class itself (a subclass of DefaultQueueStore would be rejected).
 * - set() runs on hot paths (it is awaited after every queue mutation): it only stores the value and calls
 *   onChange synchronously, it never touches Redis.
 * - Player.destroy() always calls delete(), even for the 'Shutdown' reason, so delete() only forgets the in-memory
 *   entry. Snapshot lifecycle is owned by SnapshotManager.
 */
export class SnapshotQueueStore implements QueueStoreManager {
  private readonly data = new Map<string, StoredQueue | string>();

  constructor(private readonly onChange: (guildId: string) => void) {}

  get(guildId: string): StoredQueue | string | undefined {
    return this.data.get(guildId);
  }

  set(guildId: string, value: StoredQueue | string): boolean {
    this.data.set(guildId, value);
    try {
      this.onChange(guildId);
    } catch {
      // A failing listener must never break queue mutations.
    }
    return true;
  }

  delete(guildId: string): boolean {
    return this.data.delete(guildId);
  }

  stringify(value: StoredQueue | string): StoredQueue | string {
    return value;
  }

  parse(value: StoredQueue | string): Partial<StoredQueue> {
    return typeof value === 'string' ? (JSON.parse(value) as Partial<StoredQueue>) : value;
  }
}
