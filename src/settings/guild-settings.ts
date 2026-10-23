import { DEFAULT_VOLUME, MAX_VOLUME } from '../config/constants.js';
import { LOCALES, isLocale } from '../i18n/locales.js';
import type { Locale } from '../i18n/locales.js';

export type AutoplayMode = 'related' | 'seed';

export const AUTOPLAY_MODES: readonly AutoplayMode[] = ['related', 'seed'];

/** Discord snowflake as stored in settings. */
export const SNOWFLAKE_RE = /^\d{17,20}$/;

export interface GuildSettings {
  djRoleId: string | null;
  defaultVolume: number;
  twentyFourSeven: boolean;
  autoplayEnabled: boolean;
  autoplayMode: AutoplayMode;
  defaultTextChannelId: string | null;
  defaultVoiceChannelId: string | null;
  /** Bot language of the guild; null = DEFAULT_LOCALE. */
  language: Locale | null;
  /** Channel that receives one embed per moderation case and purge; null = no mod log. */
  modLogChannelId: string | null;
  /** DM the target of a ban, kick, timeout or warning. */
  modDmTarget: boolean;
}

/** A deleted channel or role whose id must be removed from every setting that points to it. */
export type SettingsReference = { channelId: string } | { roleId: string };

/**
 * Implementations never rely on a particular backend being reachable: get() falls back to the last known or
 * default settings, update() rejects only for an invalid patch (RangeError from validateSettingsPatch).
 */
export interface GuildSettingsStore {
  get(guildId: string): Promise<GuildSettings>;
  update(guildId: string, patch: Partial<GuildSettings>): Promise<GuildSettings>;
  reset(guildId: string): Promise<void>;
  /** Clears every setting that points to the channel or role. Never rejects. */
  removeReferences(guildId: string, ref: SettingsReference): Promise<void>;
}

export function defaultSettings(): GuildSettings {
  return {
    djRoleId: null,
    defaultVolume: DEFAULT_VOLUME,
    twentyFourSeven: false,
    autoplayEnabled: false,
    autoplayMode: 'related',
    defaultTextChannelId: null,
    defaultVoiceChannelId: null,
    language: null,
    modLogChannelId: null,
    modDmTarget: true,
  };
}

/**
 * Pure: the patch that removes ref from settings ({} when nothing refers to it). Used by the memory store and the
 * outage fallback of the persistent store. defaultTextChannelId/defaultVoiceChannelId are left alone (never read).
 */
export function referencePatch(settings: GuildSettings, ref: SettingsReference): Partial<GuildSettings> {
  const patch: Partial<GuildSettings> = {};
  if ('channelId' in ref) {
    if (settings.modLogChannelId === ref.channelId) patch.modLogChannelId = null;
  } else if (settings.djRoleId === ref.roleId) {
    patch.djRoleId = null;
  }
  return patch;
}

/** Throws a RangeError for an invalid patch. Shared by every GuildSettingsStore implementation. */
export function validateSettingsPatch(patch: Partial<GuildSettings>): void {
  if (
    patch.defaultVolume !== undefined &&
    (!Number.isInteger(patch.defaultVolume) || patch.defaultVolume < 0 || patch.defaultVolume > MAX_VOLUME)
  ) {
    throw new RangeError(`defaultVolume must be an integer between 0 and ${MAX_VOLUME}`);
  }
  if (patch.autoplayMode !== undefined && !AUTOPLAY_MODES.includes(patch.autoplayMode)) {
    throw new RangeError(`autoplayMode must be one of: ${AUTOPLAY_MODES.join(', ')}`);
  }
  if (patch.language !== undefined && patch.language !== null && !isLocale(patch.language)) {
    throw new RangeError(`language must be null or one of: ${LOCALES.join(', ')}`);
  }
  if (
    patch.modLogChannelId !== undefined &&
    patch.modLogChannelId !== null &&
    (typeof patch.modLogChannelId !== 'string' || !SNOWFLAKE_RE.test(patch.modLogChannelId))
  ) {
    throw new RangeError('modLogChannelId must be null or a Discord snowflake');
  }
  if (patch.modDmTarget !== undefined && typeof patch.modDmTarget !== 'boolean') {
    throw new RangeError('modDmTarget must be a boolean');
  }
}
