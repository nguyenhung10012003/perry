import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// Discord ids are snowflakes (> 2^53), so every id column is text.

export const guildSettings = pgTable(
  'guild_settings',
  {
    guildId: text('guild_id').primaryKey(),
    djRoleId: text('dj_role_id'),
    defaultVolume: smallint('default_volume').notNull().default(100),
    twentyFourSeven: boolean('twenty_four_seven').notNull().default(false),
    autoplayEnabled: boolean('autoplay_enabled').notNull().default(false),
    autoplayMode: text('autoplay_mode').notNull().default('related'),
    defaultTextChannelId: text('default_text_channel_id'),
    defaultVoiceChannelId: text('default_voice_channel_id'),
    language: text('language'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    modLogChannelId: text('mod_log_channel_id'),
    modDmTarget: boolean('mod_dm_target').notNull().default(true),
    levelingEnabled: boolean('leveling_enabled').notNull().default(false),
    xpMultiplierPercent: smallint('xp_multiplier_percent').notNull().default(100),
    levelUpMode: text('level_up_mode').notNull().default('current'),
    levelUpChannelId: text('level_up_channel_id'),
    xpIgnoredChannelIds: text('xp_ignored_channel_ids').array().notNull().default([]),
    xpIgnoredRoleIds: text('xp_ignored_role_ids').array().notNull().default([]),
    levelRewardMode: text('level_reward_mode').notNull().default('stack'),
    leaderboardPublic: boolean('leaderboard_public').notNull().default(false),
  },
  (table) => [
    check('guild_settings_default_volume_check', sql`${table.defaultVolume} between 0 and 150`),
    check('guild_settings_autoplay_mode_check', sql`${table.autoplayMode} in ('related', 'seed')`),
    check('guild_settings_language_check', sql`${table.language} in ('en', 'vi')`),
    check('guild_settings_xp_multiplier_check', sql`${table.xpMultiplierPercent} between 10 and 500`),
    check('guild_settings_level_up_mode_check', sql`${table.levelUpMode} in ('off', 'current', 'channel', 'dm')`),
    check('guild_settings_level_reward_mode_check', sql`${table.levelRewardMode} in ('stack', 'highest')`),
    check('guild_settings_xp_ignored_channels_check', sql`cardinality(${table.xpIgnoredChannelIds}) <= 50`),
    check('guild_settings_xp_ignored_roles_check', sql`cardinality(${table.xpIgnoredRoleIds}) <= 50`),
  ],
);

export const playlists = pgTable(
  'playlists',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    ownerType: text('owner_type').notNull(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('playlists_owner_type_check', sql`${table.ownerType} in ('user', 'guild')`),
    unique('playlists_owner_name_unique').on(table.ownerType, table.ownerId, table.name),
  ],
);

export const playlistTracks = pgTable(
  'playlist_tracks',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    playlistId: integer('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    author: text('author'),
    uri: text('uri'),
    identifier: text('identifier'),
    sourceName: text('source_name'),
    durationMs: integer('duration_ms'),
    addedBy: text('added_by'),
  },
  (table) => [index('playlist_tracks_playlist_position_idx').on(table.playlistId, table.position)],
);

export const playHistory = pgTable(
  'play_history',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    guildId: text('guild_id').notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
    identifier: text('identifier'),
    sourceName: text('source_name'),
    title: text('title'),
    author: text('author'),
    durationMs: integer('duration_ms'),
    requesterId: text('requester_id'),
    discoveryProvider: text('discovery_provider'),
  },
  (table) => [index('play_history_guild_played_at_idx').on(table.guildId, table.playedAt.desc())],
);

/** Actions recorded as moderation cases (also the values allowed by mod_cases_action_check). */
export const MOD_ACTIONS = ['ban', 'unban', 'kick', 'timeout', 'untimeout', 'warn'] as const;

export const modCases = pgTable(
  'mod_cases',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    guildId: text('guild_id').notNull(),
    caseNumber: integer('case_number').notNull(),
    action: text('action').notNull(),
    targetId: text('target_id').notNull(),
    targetTag: text('target_tag'),
    moderatorId: text('moderator_id').notNull(),
    moderatorTag: text('moderator_tag'),
    reason: text('reason'),
    durationSeconds: integer('duration_seconds'),
    dmSent: boolean('dm_sent').notNull().default(false),
    logChannelId: text('log_channel_id'),
    logMessageId: text('log_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('mod_cases_guild_case_unique').on(table.guildId, table.caseNumber),
    index('mod_cases_guild_target_created_idx').on(table.guildId, table.targetId, table.createdAt.desc()),
    check('mod_cases_action_check', sql`${table.action} in ('ban', 'unban', 'kick', 'timeout', 'untimeout', 'warn')`),
    check('mod_cases_reason_check', sql`${table.reason} is null or char_length(${table.reason}) <= 512`),
    check(
      'mod_cases_duration_check',
      sql`${table.durationSeconds} is null or ${table.durationSeconds} between 1 and 2419200`,
    ),
  ],
);

/** Last case number per guild; its row lock serializes concurrent case creations, so numbers are never reused. */
export const modCaseCounters = pgTable(
  'mod_case_counters',
  {
    guildId: text('guild_id').primaryKey(),
    lastCaseNumber: integer('last_case_number').notNull().default(0),
  },
  (table) => [check('mod_case_counters_last_check', sql`${table.lastCaseNumber} >= 0`)],
);

/** XP and level of a member in a guild. The leaderboard and rank queries are served by member_levels_guild_xp_idx. */
export const memberLevels = pgTable(
  'member_levels',
  {
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    xp: integer('xp').notNull().default(0),
    level: integer('level').notNull().default(0),
    /** Display snapshots (name, avatar hash) for the web leaderboard. */
    username: text('username'),
    avatar: text('avatar'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'member_levels_pkey', columns: [table.guildId, table.userId] }),
    index('member_levels_guild_xp_idx').on(table.guildId, table.xp.desc(), table.userId),
    check('member_levels_xp_check', sql`${table.xp} between 0 and 2000000000`),
    check('member_levels_level_check', sql`${table.level} between 0 and 2000`),
  ],
);

/** Role rewards per level: one role per level, and a role is used at most once per guild. */
export const levelRoleRewards = pgTable(
  'level_role_rewards',
  {
    guildId: text('guild_id').notNull(),
    level: integer('level').notNull(),
    roleId: text('role_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'level_role_rewards_pkey', columns: [table.guildId, table.level] }),
    unique('level_role_rewards_guild_role_unique').on(table.guildId, table.roleId),
    check('level_role_rewards_level_check', sql`${table.level} between 1 and 1000`),
  ],
);
