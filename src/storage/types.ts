import type { ModAction } from '../moderation/target-check.js';
import type { PlayerSnapshotV1 } from '../music/persistence/snapshot.js';
import type { GuildSettingsStore } from '../settings/guild-settings.js';
import type { BackendHealth } from './health.js';
import type { Keys } from './keys.js';
import type { PlayHistoryEntry } from './postgres/history-repo.js';

/**
 * Contracts of the storage layer. Every method resolves with a value on backend failure (fallback) and
 * never rejects; callers do not need try/catch around storage calls.
 */

/** JSON cache. Keys are complete (built with createKeys); every write needs a TTL. */
export interface KeyValueCache {
  /** Parsed JSON, or undefined on a miss, an unreadable value or a backend failure. Callers validate the shape. */
  getJson(key: string): Promise<unknown>;
  /** True when the value was stored. */
  setJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean>;
  /** True when the key is gone (or never existed); false when the backend could not be reached. */
  del(key: string): Promise<boolean>;
}

export interface CooldownStore {
  /** Remaining whole seconds when the user is on cooldown; otherwise starts the cooldown and returns 0. */
  check(name: string, userId: string, seconds: number): Promise<number>;
}

export interface RateLimiter {
  /** Counts one hit in the window. True while the count stays within max. */
  hit(scope: string, id: string, max: number, windowSeconds: number): Promise<boolean>;
}

/** Recently played track keys per guild (discovery de-duplication). */
export interface RecentlyPlayedStore {
  add(guildId: string, trackKeys: readonly string[]): Promise<void>;
  /** Every remembered key (a fresh set the caller may mutate). Falls back to the in-process ring when Redis is down. */
  keys(guildId: string): Promise<Set<string>>;
  clear(guildId: string): Promise<void>;
}

/** Player snapshots, stored as JSON. load() validates and removes snapshots that are invalid or of another version. */
export interface SnapshotStore {
  /** True when the snapshot was stored. */
  save(guildId: string, snapshot: PlayerSnapshotV1): Promise<boolean>;
  /** The validated snapshot, or null (missing, invalid and deleted, or backend unreachable). */
  load(guildId: string): Promise<PlayerSnapshotV1 | null>;
  /** Never throws. A delete that fails because the backend is down is remembered and retried when it recovers. */
  delete(guildId: string): Promise<void>;
  /** Guild ids that currently have a snapshot; null when the backend is unreachable (distinct from "none"). */
  listGuildIds(): Promise<string[] | null>;
}

export interface HistoryStore {
  /** Fire and forget; a no-op unless PLAY_HISTORY=true. */
  record(entry: PlayHistoryEntry): void;
}

/** Outcome of a storage call that has no useful fallback value (same shape as BackendHealth.attempt). */
export type Result<T> = { ok: true; value: T } | { ok: false };

export interface ModCase {
  guildId: string;
  caseNumber: number;
  action: ModAction;
  targetId: string;
  targetTag: string | null;
  moderatorId: string;
  moderatorTag: string | null;
  reason: string | null;
  durationSeconds: number | null;
  dmSent: boolean;
  logChannelId: string | null;
  logMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input of create(); the repo assigns caseNumber and the timestamps. */
export type NewCase = Pick<
  ModCase,
  | 'guildId'
  | 'action'
  | 'targetId'
  | 'targetTag'
  | 'moderatorId'
  | 'moderatorTag'
  | 'reason'
  | 'durationSeconds'
  | 'dmSent'
>;

/**
 * Moderation cases, numbered per guild (numbers are never reused). { ok: false } means Postgres is unavailable.
 * Callers pass only range-checked values (repo input rule in case-repo.ts).
 */
export interface CaseStore {
  create(input: NewCase): Promise<Result<ModCase>>;
  get(guildId: string, caseNumber: number): Promise<Result<ModCase | null>>;
  /** Newest first; total counts every matching case. */
  listForUser(
    guildId: string,
    userId: string,
    opts: { action?: ModAction; offset: number; limit: number },
  ): Promise<Result<{ cases: ModCase[]; total: number }>>;
  /** The updated case, or null when it does not exist. */
  updateReason(guildId: string, caseNumber: number, reason: string | null): Promise<Result<ModCase | null>>;
  /** Best effort; failures are ignored. */
  setLogMessage(guildId: string, caseNumber: number, channelId: string, messageId: string): Promise<void>;
  /** Best effort; records the DM result of a warning, whose case is created before its DM. */
  setDmSent(guildId: string, caseNumber: number, dmSent: boolean): Promise<void>;
  /** True when the case existed. */
  delete(guildId: string, caseNumber: number): Promise<Result<boolean>>;
  /** Number of warnings deleted. */
  clearWarnings(guildId: string, userId: string): Promise<Result<number>>;
}

export interface StorageHealth {
  readonly postgres: BackendHealth | null;
  readonly redis: BackendHealth | null;
}

export interface Storage {
  readonly driver: 'persistent' | 'memory';
  readonly settings: GuildSettingsStore;
  readonly cooldowns: CooldownStore;
  readonly limiter: RateLimiter;
  readonly cache: KeyValueCache;
  readonly recent: RecentlyPlayedStore;
  readonly snapshots: SnapshotStore;
  readonly history: HistoryStore;
  readonly cases: CaseStore;
  readonly health: StorageHealth;
  /** Redis key scheme for the configured REDIS_KEY_PREFIX (single instance shared by every consumer). */
  readonly keys: Keys;
  /** Removes per-guild data other than settings (snapshot, recently played). Never rejects. */
  purgeGuild(guildId: string): Promise<void>;
  /** Stops timers and closes connections within a short cap. Never rejects. */
  close(): Promise<void>;
}
