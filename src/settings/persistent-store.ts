import { z } from 'zod';
import { MAX_VOLUME, SETTINGS_CACHE_TTL_SECONDS, SETTINGS_L1_TTL_MS } from '../config/constants.js';
import { LOCALES } from '../i18n/locales.js';
import type { BackendHealth } from '../storage/health.js';
import type { Keys } from '../storage/keys.js';
import type { Database } from '../storage/postgres/client.js';
import {
  deleteSettings,
  getSettings,
  removeChannelReferences,
  removeRoleReferences,
  upsertSettings,
} from '../storage/postgres/settings-repo.js';
import type { KeyValueCache } from '../storage/types.js';
import type { GuildSettings, GuildSettingsStore, SettingsReference } from './guild-settings.js';
import { defaultSettings, referencePatch, validateSettingsPatch } from './guild-settings.js';

const L1_SWEEP_THRESHOLD = 1000;

const cachedSettingsSchema = z.object({
  djRoleId: z.string().nullable(),
  defaultVolume: z.number().int().min(0).max(MAX_VOLUME),
  twentyFourSeven: z.boolean(),
  autoplayEnabled: z.boolean(),
  autoplayMode: z.enum(['related', 'seed']),
  defaultTextChannelId: z.string().nullable(),
  defaultVoiceChannelId: z.string().nullable(),
  // Tolerated when absent: v1.2 entries have no language (and their DB row is still null), so no key version bump.
  language: z.enum(LOCALES).nullable().default(null),
  // v1.4 fields; v1.3 entries decode with the column defaults.
  modLogChannelId: z.string().nullable().default(null),
  modDmTarget: z.boolean().default(true),
});

export interface PersistentSettingsDeps {
  readonly db: Database;
  readonly postgres: BackendHealth;
  readonly cache: KeyValueCache;
  /** Null when no Redis is configured: invalidations are then trivially complete. */
  readonly redis: BackendHealth | null;
  readonly keys: Keys;
  /** Called after every local write so other processes can drop their L1 copy (optional pub/sub). */
  readonly publishInvalidation?: (guildId: string) => void;
}

function withoutUndefined(patch: Partial<GuildSettings>): Partial<GuildSettings> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

function sameReference(a: SettingsReference, b: SettingsReference): boolean {
  if ('channelId' in a) return 'channelId' in b && a.channelId === b.channelId;
  return 'roleId' in b && a.roleId === b.roleId;
}

/** The atomic removal statement for one reference (also used to replay queued removals). */
function removeReference(db: Database, guildId: string, ref: SettingsReference): Promise<GuildSettings | null> {
  return 'channelId' in ref
    ? removeChannelReferences(db, guildId, ref.channelId)
    : removeRoleReferences(db, guildId, ref.roleId);
}

/**
 * Guild settings: L1 memory (5 s) -> Redis cache (1 h) -> Postgres (source of truth).
 *
 * Writes go to Postgres first, then delete the Redis key, then drop L1 (invalidate on write).
 * - Redis unreachable for the delete: the guild id is remembered and deleted when Redis recovers.
 * - Postgres unreachable: reads serve the last known (or default) settings from `fallback`; writes are applied to
 *   `fallback` and queued (`pendingWrites` / `pendingResets`), then flushed with an upsert when Postgres recovers.
 *   Reference removals (deleted channel or role) queue the reference itself (`pendingRemovals`), never a rebuilt
 *   value, and replay the same atomic UPDATE after the queued writes.
 * No method rejects, except update() for an invalid patch (RangeError).
 */
export class PersistentGuildSettingsStore implements GuildSettingsStore {
  private readonly l1 = new Map<string, { value: GuildSettings; expiresAt: number }>();
  private readonly fallback = new Map<string, GuildSettings>();
  private readonly pendingWrites = new Map<string, Partial<GuildSettings>>();
  private readonly pendingResets = new Set<string>();
  /** References queued during a Postgres outage, in order (append only, duplicates skipped). */
  private readonly pendingRemovals = new Map<string, SettingsReference[]>();
  private readonly pendingInvalidations = new Set<string>();
  /** Bumped by every write; a read that overlapped a write must not repopulate the caches with stale data. */
  private epoch = 0;

  constructor(private readonly deps: PersistentSettingsDeps) {
    deps.postgres.onRecover(() => this.flushPendingWrites());
    deps.redis?.onRecover(() => this.flushPendingInvalidations());
  }

  async get(guildId: string): Promise<GuildSettings> {
    if (this.hasPending(guildId)) return this.withPendingRemovals(guildId, this.fallback.get(guildId) ?? defaultSettings());
    const hit = this.l1.get(guildId);
    if (hit !== undefined && hit.expiresAt > Date.now()) return { ...hit.value };

    const key = this.deps.keys.settings(guildId);
    const cached = cachedSettingsSchema.safeParse(await this.deps.cache.getJson(key));
    if (cached.success) {
      this.setL1(guildId, cached.data);
      return { ...cached.data };
    }

    const startEpoch = this.epoch;
    const { db } = this.deps;
    const loaded = await this.deps.postgres.attempt(() => getSettings(db, guildId));
    if (!loaded.ok) return { ...(this.fallback.get(guildId) ?? defaultSettings()) };
    const settings = loaded.value ?? defaultSettings();
    this.fallback.set(guildId, settings);
    if (this.epoch === startEpoch) {
      this.setL1(guildId, settings);
      await this.deps.cache.setJson(key, settings, SETTINGS_CACHE_TTL_SECONDS);
    }
    return { ...settings };
  }

  async update(guildId: string, patch: Partial<GuildSettings>): Promise<GuildSettings> {
    validateSettingsPatch(patch);
    const clean = withoutUndefined(patch);
    this.epoch += 1;
    const { db } = this.deps;
    const written = await this.deps.postgres.attempt(async () => {
      await this.flushGuild(guildId);
      return upsertSettings(db, guildId, clean);
    });
    let result: GuildSettings;
    if (written.ok) {
      result = written.value;
      this.fallback.set(guildId, result);
    } else {
      result = { ...(this.fallback.get(guildId) ?? defaultSettings()), ...clean };
      this.fallback.set(guildId, result);
      this.pendingWrites.set(guildId, { ...this.pendingWrites.get(guildId), ...clean });
      result = this.withPendingRemovals(guildId, result);
    }
    await this.invalidate(guildId);
    return { ...result };
  }

  async reset(guildId: string): Promise<void> {
    this.epoch += 1;
    this.fallback.delete(guildId);
    this.pendingWrites.delete(guildId);
    this.pendingRemovals.delete(guildId);
    const { db } = this.deps;
    const deleted = await this.deps.postgres.attempt(() => deleteSettings(db, guildId));
    if (deleted.ok) this.pendingResets.delete(guildId);
    else this.pendingResets.add(guildId);
    await this.invalidate(guildId);
  }

  /**
   * One atomic UPDATE per call (no read-modify-write), so concurrent removals and writers cannot resurrect an id.
   * During a Postgres outage the reference is queued and replayed with the same statement on recovery.
   */
  async removeReferences(guildId: string, ref: SettingsReference): Promise<void> {
    this.epoch += 1;
    const { db } = this.deps;
    const removed = await this.deps.postgres.attempt(async () => {
      await this.flushGuild(guildId);
      return removeReference(db, guildId, ref);
    });
    if (removed.ok) {
      // null: nothing referred to the id, so there is nothing to invalidate.
      if (removed.value === null) return;
      this.fallback.set(guildId, removed.value);
      await this.invalidate(guildId);
      return;
    }
    // Read before queueing: the fallback map is empty while Redis still holds the row (e.g. started during the outage).
    const current = await this.get(guildId);
    if (!this.fallback.has(guildId)) this.fallback.set(guildId, current);
    const queue = this.pendingRemovals.get(guildId);
    if (queue === undefined) this.pendingRemovals.set(guildId, [ref]);
    else if (!queue.some((queued) => sameReference(queued, ref))) queue.push(ref);
    await this.invalidate(guildId);
  }

  /** Drops the local (L1) copy; used by the optional pub/sub hook when another process wrote. */
  invalidateLocal(guildId: string): void {
    this.l1.delete(guildId);
  }

  private hasPending(guildId: string): boolean {
    return this.pendingWrites.has(guildId) || this.pendingResets.has(guildId) || this.pendingRemovals.has(guildId);
  }

  /** A copy of base with every queued reference removed, in queue order. */
  private withPendingRemovals(guildId: string, base: GuildSettings): GuildSettings {
    let result = { ...base };
    for (const ref of this.pendingRemovals.get(guildId) ?? []) result = { ...result, ...referencePatch(result, ref) };
    return result;
  }

  private setL1(guildId: string, value: GuildSettings): void {
    const now = Date.now();
    if (this.l1.size >= L1_SWEEP_THRESHOLD) {
      for (const [key, entry] of this.l1) {
        if (entry.expiresAt <= now) this.l1.delete(key);
      }
    }
    this.l1.set(guildId, { value: { ...value }, expiresAt: now + SETTINGS_L1_TTL_MS });
  }

  /** Redis DEL, then L1 drop. A failed DEL is remembered and retried on Redis recovery. */
  private async invalidate(guildId: string): Promise<void> {
    const deleted = await this.deps.cache.del(this.deps.keys.settings(guildId));
    if (deleted) this.pendingInvalidations.delete(guildId);
    else this.pendingInvalidations.add(guildId);
    this.l1.delete(guildId);
    this.deps.publishInvalidation?.(guildId);
  }

  /**
   * Applies queued writes of one guild to Postgres in order (reset first, then the merged patch, then the queued
   * reference removals). Throws on failure.
   */
  private async flushGuild(guildId: string): Promise<void> {
    const { db } = this.deps;
    if (this.pendingResets.has(guildId)) {
      await deleteSettings(db, guildId);
      this.pendingResets.delete(guildId);
    }
    const patch = this.pendingWrites.get(guildId);
    if (patch !== undefined) {
      await upsertSettings(db, guildId, patch);
      // Keep fields written meanwhile: only drop the queue entry if it was not extended during the await.
      if (this.pendingWrites.get(guildId) === patch) this.pendingWrites.delete(guildId);
    }
    const queue = this.pendingRemovals.get(guildId);
    if (queue !== undefined) {
      const replay = [...queue];
      for (const ref of replay) {
        const row = await removeReference(db, guildId, ref);
        if (row !== null) this.fallback.set(guildId, row);
      }
      // References appended during the replay stay queued; a reset meanwhile replaced or dropped the queue.
      if (this.pendingRemovals.get(guildId) === queue) {
        queue.splice(0, replay.length);
        if (queue.length === 0) this.pendingRemovals.delete(guildId);
      }
    }
  }

  private async flushPendingWrites(): Promise<void> {
    const guildIds = new Set([...this.pendingResets, ...this.pendingWrites.keys(), ...this.pendingRemovals.keys()]);
    for (const guildId of guildIds) {
      const flushed = await this.deps.postgres.attempt(() => this.flushGuild(guildId));
      if (!flushed.ok) return;
      this.epoch += 1;
      await this.invalidate(guildId);
    }
  }

  private async flushPendingInvalidations(): Promise<void> {
    for (const guildId of [...this.pendingInvalidations]) {
      const deleted = await this.deps.cache.del(this.deps.keys.settings(guildId));
      if (!deleted) return;
      this.pendingInvalidations.delete(guildId);
      this.l1.delete(guildId);
    }
  }
}
