/** Limits and tunables shared across the bot (plan D22). */
export const MAX_QUEUE_SIZE = 1000;
export const MAX_PLAYLIST_TRACKS = 300;
export const ALONE_TIMEOUT_MS = 60_000;
export const IDLE_TIMEOUT_MS = 180_000;
export const QUEUE_PAGE_SIZE = 10;
export const MAX_VOLUME = 150;
export const DEFAULT_VOLUME = 100;
export const SEEK_STEP_DEFAULT = 10;
export const AUTOCOMPLETE_DEBOUNCE_MS = 250;
export const AUTOCOMPLETE_TIMEOUT_MS = 2200;
export const ERROR_BATCH_MS = 3000;
export const NODE_BACKOFF_MS = [5000, 10000, 20000, 40000, 60000] as const;

/** Grace period before a stuck shutdown is forced. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Storage backends (plan v1.1 section 5). */
export const STORAGE_BACKOFF_MS = [
  1000, 2000, 5000, 10_000, 30_000, 60_000,
] as const;
export const STORAGE_STARTUP_TIMEOUT_MS = 5000;
export const STORAGE_CONNECT_TIMEOUT_MS = 3000;
/**
 * Runtime timeouts are short on purpose: the cooldown check and the DJ-role lookup run before a command can be
 * acknowledged (Discord allows 3 s), so a black-holed backend must be given up on quickly (it then degrades).
 */
export const REDIS_COMMAND_TIMEOUT_MS = 1000;
export const PG_POOL_CONNECT_TIMEOUT_MS = 1000;
export const PG_QUERY_TIMEOUT_MS = 1500;
export const SETTINGS_CACHE_TTL_SECONDS = 3600;
export const SETTINGS_L1_TTL_MS = 5000;

/** Player snapshots and restore. */
export const SNAPSHOT_DEBOUNCE_MS = 3000;
export const SNAPSHOT_MAX_WAIT_MS = 15_000;
export const SNAPSHOT_HEARTBEAT_MS = 20_000;
export const SNAPSHOT_TTL_SECONDS = 21_600;
export const SNAPSHOT_MAX_QUEUE_TRACKS = 200;
export const SNAPSHOT_MAX_PREVIOUS_TRACKS = 5;
export const SNAPSHOT_MAX_BYTES = 524_288;
export const SNAPSHOT_FLUSH_TIMEOUT_MS = 2000;
export const RESTORE_STAGGER_MS = 300;

/** Recently played set, caches. */
export const RECENT_MAX_MEMBERS = 400;
export const RECENT_TTL_SECONDS = 21_600;
export const AUTOCOMPLETE_REDIS_TTL_SECONDS = 60;
export const LASTFM_CACHE_TTL_SECONDS = 21_600;

/** Music discovery (autoplay, radio, similar). */
export const LASTFM_SIMILAR_LIMIT = 20;
export const LASTFM_RESOLVE_CONCURRENCY = 4;
export const DISCOVERY_MIN_RESULTS = 3;
export const DISCOVERY_TIMEOUT_MS = 10_000;
export const DISCOVERY_PROVIDER_TIMEOUT_MS = 6000;
export const DISCOVERY_MAX_SAME_ARTIST_RUN = 2;
export const DISCOVERY_MAX_CALLS_PER_HOUR = 60;
export const AUTOPLAY_MAX_REFILLS_PER_HOUR = 30;
/** Window of the autoplay / discovery rate limits (per guild). */
export const DISCOVERY_LIMIT_WINDOW_SECONDS = 3600;
export const SIMILAR_MAX_TRACKS = 25;
export const PREVIOUS_DEDUPE_WINDOW = 25;

/** Upper bound for closing storage connections during shutdown. */
export const STORAGE_CLOSE_TIMEOUT_MS = 1500;

/** Container startup runtime (v1.2): migrations, command sync, heartbeat, login throttle. */
export const MIGRATION_ADVISORY_LOCK_KEY = 726_572_001;
export const MIGRATE_LOCK_TIMEOUT_MS = 120_000;
export const MIGRATE_ATTEMPTS = 10;
export const MIGRATE_RETRY_DELAY_MS = 3000;
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_MAX_AGE_MS = 60_000;
export const COMMAND_HASH_TTL_SECONDS = 2_592_000;
export const LOGIN_FAILURE_EXIT_DELAY_MS = 30_000;

/** Moderation (v1.4). */
export const MOD_REASON_MAX_LENGTH = 512;
/** Discord's longest timeout: 28 days. */
export const MOD_TIMEOUT_MAX_MS = 2_419_200_000;
export const MOD_PURGE_MAX = 100;
export const MOD_CASES_PAGE_SIZE = 10;
/** `/ban delete_messages` choices (A8): seconds of message history to delete. */
export const BAN_DELETE_SECONDS = {
  none: 0,
  '1h': 3600,
  '6h': 21_600,
  '12h': 43_200,
  '24h': 86_400,
  '3d': 259_200,
  '7d': 604_800,
} as const;
