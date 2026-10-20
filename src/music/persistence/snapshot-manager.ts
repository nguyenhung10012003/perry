import type { Player } from 'lavalink-client';
import {
  SNAPSHOT_DEBOUNCE_MS,
  SNAPSHOT_FLUSH_TIMEOUT_MS,
  SNAPSHOT_HEARTBEAT_MS,
  SNAPSHOT_MAX_WAIT_MS,
} from '../../config/constants.js';
import type { SnapshotStore } from '../../storage/types.js';
import { safeError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { GuildMusicState } from '../guild-state.js';
import { buildSnapshot } from './snapshot.js';

export interface SnapshotManagerOptions {
  readonly store: SnapshotStore;
  /** False turns every method into a no-op (memory driver or PLAYER_RESTORE=false). */
  readonly enabled: boolean;
  readonly logger: Logger;
  /** Live lookups; the manager is created before the LavalinkManager so these are late-bound. */
  readonly getPlayer: (guildId: string) => Player | undefined;
  readonly getPlayers: () => Iterable<Player>;
  readonly getState: (guildId: string) => GuildMusicState | undefined;
}

interface PendingWrite {
  timer: NodeJS.Timeout;
  /** When the guild first became dirty in this window (for the max wait). */
  since: number;
}

/**
 * Writes player snapshots to the snapshot store without hammering it:
 * - markDirty() is a per-guild trailing debounce (SNAPSHOT_DEBOUNCE_MS) with a max wait (SNAPSHOT_MAX_WAIT_MS);
 * - one unref'd heartbeat marks playing players dirty so the saved position stays fresh;
 * - writes and deletes of one guild are serialised, so a discard can never be overtaken by an older save;
 * - flushAll() (graceful shutdown) saves every player with its exact position, bounded by SNAPSHOT_FLUSH_TIMEOUT_MS.
 * It never throws; store failures are already handled (and logged once) by the storage layer.
 */
export class SnapshotManager {
  private readonly pending = new Map<string, PendingWrite>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly restoring = new Set<string>();
  private heartbeat: NodeJS.Timeout | undefined;
  private frozen = false;

  constructor(private readonly options: SnapshotManagerOptions) {
    if (!options.enabled) return;
    this.heartbeat = setInterval(() => {
      for (const player of this.options.getPlayers()) {
        if (player.playing && !player.paused) this.markDirty(player.guildId);
      }
    }, SNAPSHOT_HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  get enabled(): boolean {
    return this.options.enabled;
  }

  /** Schedules a snapshot write; repeated calls inside the window collapse into one write. */
  markDirty(guildId: string): void {
    if (!this.options.enabled || this.frozen || this.restoring.has(guildId)) return;
    const now = Date.now();
    const existing = this.pending.get(guildId);
    const since = existing?.since ?? now;
    if (existing) clearTimeout(existing.timer);
    const delay = Math.max(0, Math.min(SNAPSHOT_DEBOUNCE_MS, since + SNAPSHOT_MAX_WAIT_MS - now));
    const timer = setTimeout(() => {
      this.pending.delete(guildId);
      void this.flush(guildId);
    }, delay);
    timer.unref();
    this.pending.set(guildId, { timer, since });
  }

  /** Writes the guild's snapshot now (deletes it when there is nothing left to restore). */
  flush(guildId: string): Promise<void> {
    if (!this.options.enabled) return Promise.resolve();
    this.clearPending(guildId);
    return this.enqueue(guildId, async () => {
      if (this.restoring.has(guildId)) return;
      const player = this.options.getPlayer(guildId);
      // No player: it was destroyed. discard() (or, for 'Shutdown', the kept snapshot) already decided its fate.
      if (!player) return;
      const snapshot = buildSnapshot(player, this.options.getState(guildId));
      if (snapshot) await this.options.store.save(guildId, snapshot);
      else await this.options.store.delete(guildId);
    });
  }

  /** Flushes every live player (exact positions) within SNAPSHOT_FLUSH_TIMEOUT_MS. Used by graceful shutdown. */
  async flushAll(): Promise<void> {
    if (!this.options.enabled) return;
    const guildIds = new Set<string>(this.pending.keys());
    for (const player of this.options.getPlayers()) guildIds.add(player.guildId);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...guildIds].map((guildId) => this.flush(guildId))),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            this.options.logger.warn({ guilds: guildIds.size }, 'Snapshot flush timed out');
            resolve();
          }, SNAPSHOT_FLUSH_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * Forgets the guild's snapshot: cancels the pending write and deletes the stored one. A delete that fails while
   * Redis is down is remembered by the store and retried when Redis recovers (not after a process restart).
   */
  discard(guildId: string): Promise<void> {
    if (!this.options.enabled) return Promise.resolve();
    this.clearPending(guildId);
    return this.enqueue(guildId, () => this.options.store.delete(guildId));
  }

  /** Ignores every further markDirty (shutdown: the snapshots written by flushAll must stay as they are). */
  freeze(): void {
    this.frozen = true;
    for (const guildId of [...this.pending.keys()]) this.clearPending(guildId);
  }

  /** Suppresses writes for the guild while it is being restored. */
  beginRestore(guildId: string): void {
    if (!this.options.enabled) return;
    this.clearPending(guildId);
    this.restoring.add(guildId);
  }

  /** Re-enables writes for the guild and schedules a fresh snapshot of the restored player. */
  endRestore(guildId: string): void {
    if (!this.restoring.delete(guildId)) return;
    this.markDirty(guildId);
  }

  dispose(): void {
    this.frozen = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    for (const guildId of [...this.pending.keys()]) this.clearPending(guildId);
    this.restoring.clear();
  }

  private clearPending(guildId: string): void {
    const entry = this.pending.get(guildId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(guildId);
  }

  private enqueue(guildId: string, operation: () => Promise<unknown>): Promise<void> {
    const previous = this.chains.get(guildId) ?? Promise.resolve();
    const next = previous
      .then(operation)
      .then(
        () => undefined,
        (err: unknown) => {
          this.options.logger.warn({ err: safeError(err), guildId }, 'Snapshot operation failed');
        },
      );
    this.chains.set(guildId, next);
    void next.then(() => {
      if (this.chains.get(guildId) === next) this.chains.delete(guildId);
    });
    return next;
  }
}
