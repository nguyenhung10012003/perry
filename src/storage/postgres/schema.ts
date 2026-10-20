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
