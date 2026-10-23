import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
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
  },
  (table) => [
    check('guild_settings_default_volume_check', sql`${table.defaultVolume} between 0 and 150`),
    check('guild_settings_autoplay_mode_check', sql`${table.autoplayMode} in ('related', 'seed')`),
    check('guild_settings_language_check', sql`${table.language} in ('en', 'vi')`),
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
