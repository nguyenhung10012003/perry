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

/** Leveling (v1.4). XP economy defaults (A25): 15-25 XP per eligible message, one grant per 60 s per member. */
export const XP_COOLDOWN_SECONDS = 60;
export const XP_PER_MESSAGE_MIN = 15;
export const XP_PER_MESSAGE_MAX = 25;
export const XP_MULTIPLIER_MIN_PERCENT = 10;
export const XP_MULTIPLIER_MAX_PERCENT = 500;
/** XP cap (A12, about level 1058); below 2^31 - 1, so member_levels.xp fits an `integer`. */
export const XP_TOTAL_MAX = 2_000_000_000;
/** Largest `/xp add|remove` amount. */
export const XP_ADJUST_MAX = 1_000_000;
export const LEVEL_REWARD_MAX_LEVEL = 1000;
export const LEVEL_REWARDS_MAX = 25;
/** Most ignored channels and most ignored roles per guild. */
export const XP_IGNORED_MAX = 50;
export const LEADERBOARD_PAGE_SIZE = 10;
/** Largest `/leaderboard page` option (M11); the requested page is clamped to the last page anyway. */
export const LEADERBOARD_PAGE_MAX = 10_000;
/**
 * Namespace of the per-guild advisory lock that serializes reward saves (`replaceRewards`). Two-int advisory keys do
 * not overlap the migrator's single bigint key (MIGRATION_ADVISORY_LOCK_KEY = 726_572_001).
 */
export const REWARDS_LOCK_NAMESPACE = 726_572_002;

/** Bot-mediated Redis bridge between the web and the bot (v1.4, DP-10 (b)). */
export const BRIDGE_TIMEOUT_MS = { gmeta: 2000, 'automod.list': 5000, 'automod.put': 8000 } as const;
export const BRIDGE_POLL_INTERVAL_MS = 100;
export const BRIDGE_RESPONSE_TTL_SECONDS = 30;
/** The bot rewrites its guild list (`botguilds`) this often, and 2 s after a guild join or leave. */
export const BRIDGE_BOTGUILDS_INTERVAL_MS = 60_000;
export const BRIDGE_BOTGUILDS_REFRESH_DELAY_MS = 2000;
export const BRIDGE_BOTGUILDS_TTL_SECONDS = 180;
/** Upper bound for deleting `botguilds` while the bot shuts down. */
export const BRIDGE_STOP_TIMEOUT_MS = 500;

/** Web dashboard (v1.4). */
export const WEB_BODY_LIMIT_BYTES = 16_384;
/** PUT /api/guilds/:id/automod/:kind: 1000 keywords of 60 Vietnamese characters are about 180 KB of JSON. */
export const WEB_AUTOMOD_BODY_LIMIT_BYTES = 262_144;
/** Repeats the settings DEL after a web write; above PG_QUERY_TIMEOUT_MS + REDIS_COMMAND_TIMEOUT_MS (design R3). */
export const WEB_SETTINGS_REDEL_DELAY_MS = 3000;
/** Sessions last at most 7 days (A20) and never longer than the Discord token. */
export const WEB_SESSION_MAX_TTL_SECONDS = 604_800;
export const WEB_OAUTH_STATE_TTL_SECONDS = 600;
export const WEB_USER_GUILDS_TTL_SECONDS = 60;
/** Cache of the bot's guild data reply (`gmeta:<guildId>`). */
export const GUILD_META_TTL_SECONDS = 60;
/** In-process memo of the parsed `botguilds` key. */
export const WEB_BOT_GUILDS_MEMO_MS = 5000;
/** Timeout of every Discord REST call the web makes with the user's token or the client credentials. */
export const WEB_DISCORD_TIMEOUT_MS = 8000;
export const WEB_LEADERBOARD_PAGE_SIZE = 25;
export const WEB_LEADERBOARD_PAGE_MAX = 100;
export const WEB_PUBLIC_LEADERBOARD_PAGE_MAX = 40;
export const WEB_PUBLIC_LEADERBOARD_TTL_SECONDS = 30;
/** Rate limits of the web (fixed windows on RedisRateLimiter, in-process fallback). */
export const WEB_RATE_LIMITS = {
  'web-auth': { max: 20, windowSeconds: 600 },
  'web-api': { max: 120, windowSeconds: 60 },
  'web-write': { max: 30, windowSeconds: 60 },
  'web-refresh': { max: 6, windowSeconds: 60 },
  'web-public': { max: 60, windowSeconds: 60 },
} as const;
