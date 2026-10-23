import { and, eq, sql } from 'drizzle-orm';
import { isLocale } from '../../i18n/locales.js';
import type { GuildSettings } from '../../settings/guild-settings.js';
import { AUTOPLAY_MODES, defaultSettings } from '../../settings/guild-settings.js';
import type { Database } from './client.js';
import { guildSettings } from './schema.js';

// Repo input rule (design 4.6.2): callers pass only range-checked values (validateSettingsPatch), because
// BackendHealth.attempt marks Postgres down for ANY thrown error, data errors included.

type Row = typeof guildSettings.$inferSelect;
type Columns = Partial<typeof guildSettings.$inferInsert>;

function toSettings(row: Row): GuildSettings {
  const mode = AUTOPLAY_MODES.find((candidate) => candidate === row.autoplayMode);
  return {
    djRoleId: row.djRoleId,
    defaultVolume: row.defaultVolume,
    twentyFourSeven: row.twentyFourSeven,
    autoplayEnabled: row.autoplayEnabled,
    autoplayMode: mode ?? defaultSettings().autoplayMode,
    defaultTextChannelId: row.defaultTextChannelId,
    defaultVoiceChannelId: row.defaultVoiceChannelId,
    language: isLocale(row.language) ? row.language : null,
    modLogChannelId: row.modLogChannelId,
    modDmTarget: row.modDmTarget,
  };
}

/** Maps the defined fields of a settings patch to table columns. */
function toColumns(patch: Partial<GuildSettings>): Columns {
  const columns: Columns = {};
  if (patch.djRoleId !== undefined) columns.djRoleId = patch.djRoleId;
  if (patch.defaultVolume !== undefined) columns.defaultVolume = patch.defaultVolume;
  if (patch.twentyFourSeven !== undefined) columns.twentyFourSeven = patch.twentyFourSeven;
  if (patch.autoplayEnabled !== undefined) columns.autoplayEnabled = patch.autoplayEnabled;
  if (patch.autoplayMode !== undefined) columns.autoplayMode = patch.autoplayMode;
  if (patch.defaultTextChannelId !== undefined) columns.defaultTextChannelId = patch.defaultTextChannelId;
  if (patch.defaultVoiceChannelId !== undefined) columns.defaultVoiceChannelId = patch.defaultVoiceChannelId;
  if (patch.language !== undefined) columns.language = patch.language;
  if (patch.modLogChannelId !== undefined) columns.modLogChannelId = patch.modLogChannelId;
  if (patch.modDmTarget !== undefined) columns.modDmTarget = patch.modDmTarget;
  return columns;
}

/** Returns the stored settings, or null when the guild has no row (defaults apply). */
export async function getSettings(db: Database, guildId: string): Promise<GuildSettings | null> {
  const rows = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
  const row = rows[0];
  return row ? toSettings(row) : null;
}

/**
 * Inserts the guild row (defaults + patch) or updates only the patched columns, and returns the stored row.
 * Updating columns instead of the whole row keeps concurrent writers from overwriting each other's fields.
 */
export async function upsertSettings(
  db: Database,
  guildId: string,
  patch: Partial<GuildSettings>,
): Promise<GuildSettings> {
  const rows = await db
    .insert(guildSettings)
    .values({ guildId, ...toColumns(defaultSettings()), ...toColumns(patch) })
    .onConflictDoUpdate({ target: guildSettings.guildId, set: { ...toColumns(patch), updatedAt: sql`now()` } })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Upsert returned no row');
  return toSettings(row);
}

export async function deleteSettings(db: Database, guildId: string): Promise<void> {
  await db.delete(guildSettings).where(eq(guildSettings.guildId, guildId));
}

/**
 * Clears every setting that points to the deleted channel in one guarded UPDATE, so concurrent event handlers and
 * writers cannot bring the id back. Returns the updated row, or null when nothing referred to the channel.
 */
export async function removeChannelReferences(
  db: Database,
  guildId: string,
  channelId: string,
): Promise<GuildSettings | null> {
  const rows = await db
    .update(guildSettings)
    .set({
      modLogChannelId: sql`nullif(${guildSettings.modLogChannelId}, ${channelId})`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(guildSettings.guildId, guildId), eq(guildSettings.modLogChannelId, channelId)))
    .returning();
  const row = rows[0];
  return row ? toSettings(row) : null;
}

/** Same as removeChannelReferences for a deleted role. */
export async function removeRoleReferences(
  db: Database,
  guildId: string,
  roleId: string,
): Promise<GuildSettings | null> {
  const rows = await db
    .update(guildSettings)
    .set({
      djRoleId: sql`nullif(${guildSettings.djRoleId}, ${roleId})`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(guildSettings.guildId, guildId), eq(guildSettings.djRoleId, roleId)))
    .returning();
  const row = rows[0];
  return row ? toSettings(row) : null;
}
