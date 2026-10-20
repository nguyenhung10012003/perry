import type { Redis } from 'ioredis';
import { SNAPSHOT_TTL_SECONDS } from '../../config/constants.js';
import { PlayerSnapshotV1Schema } from '../../music/persistence/snapshot.js';
import type { PlayerSnapshotV1 } from '../../music/persistence/snapshot.js';
import type { BackendHealth } from '../health.js';
import type { Keys } from '../keys.js';
import type { SnapshotStore } from '../types.js';

const SCAN_COUNT = 200;
/** Safety net for a runaway SCAN (200 keys per round trip). */
const SCAN_MAX_ROUNDS = 5000;
/** Upper bound of guild ids whose delete is remembered during an outage (oldest evicted first). */
const PENDING_DELETES_MAX = 1000;

/** One JSON document per guild with a TTL that is refreshed on every write. */
export class RedisSnapshotStore implements SnapshotStore {
  /** Guild ids whose delete failed (Redis down); re-issued when Redis recovers. Insertion ordered. */
  private readonly pendingDeletes = new Set<string>();

  constructor(
    private readonly client: Redis,
    private readonly health: BackendHealth,
    private readonly keys: Keys,
  ) {
    // Registered at construction, so it runs before hooks registered later (e.g. the restore retry).
    health.onRecover(() => this.flushPendingDeletes());
  }

  async save(guildId: string, snapshot: PlayerSnapshotV1): Promise<boolean> {
    const json = JSON.stringify(snapshot);
    const result = await this.health.attempt(() =>
      this.client.set(this.keys.snapshot(guildId), json, 'EX', SNAPSHOT_TTL_SECONDS),
    );
    // A newer snapshot supersedes a delete that failed earlier: the flush must not remove it.
    if (result.ok) this.pendingDeletes.delete(guildId);
    return result.ok;
  }

  async load(guildId: string): Promise<PlayerSnapshotV1 | null> {
    if (this.pendingDeletes.has(guildId)) return null;
    const key = this.keys.snapshot(guildId);
    const raw = await this.health.guard(() => this.client.get(key), null);
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = undefined;
    }
    const result = PlayerSnapshotV1Schema.safeParse(parsed);
    if (!result.success) {
      // Corrupt, truncated or written by another version: never retry it.
      await this.health.attempt(() => this.client.del(key));
      return null;
    }
    return result.data;
  }

  async delete(guildId: string): Promise<void> {
    const result = await this.health.attempt(() => this.client.del(this.keys.snapshot(guildId)));
    if (result.ok) {
      this.pendingDeletes.delete(guildId);
      return;
    }
    this.rememberDelete(guildId);
  }

  private rememberDelete(guildId: string): void {
    this.pendingDeletes.delete(guildId);
    this.pendingDeletes.add(guildId);
    if (this.pendingDeletes.size > PENDING_DELETES_MAX) {
      const oldest = this.pendingDeletes.values().next();
      if (!oldest.done) this.pendingDeletes.delete(oldest.value);
    }
  }

  /** Re-issues the deletes that failed during an outage; an id is dropped only after its DEL succeeded. */
  private async flushPendingDeletes(): Promise<void> {
    for (const guildId of [...this.pendingDeletes]) {
      // Removed meanwhile (a newer save() or a successful delete()).
      if (!this.pendingDeletes.has(guildId)) continue;
      const result = await this.health.attempt(() => this.client.del(this.keys.snapshot(guildId)));
      if (!result.ok) return; // down again: the next recovery retries the rest
      this.pendingDeletes.delete(guildId);
    }
  }

  async listGuildIds(): Promise<string[] | null> {
    const pattern = this.keys.snapshotScan();
    const prefix = pattern.slice(0, -1);
    return this.health.guard<string[] | null>(async () => {
      const ids = new Set<string>();
      let cursor = '0';
      for (let round = 0; round < SCAN_MAX_ROUNDS; round++) {
        const [next, found] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT);
        for (const key of found) ids.add(key.slice(prefix.length));
        cursor = next;
        if (cursor === '0') break;
      }
      for (const guildId of this.pendingDeletes) ids.delete(guildId);
      return [...ids];
    }, null);
  }
}
