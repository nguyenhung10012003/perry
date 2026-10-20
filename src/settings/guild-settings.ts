import { DEFAULT_VOLUME, MAX_VOLUME } from '../config/constants.js';
import { LOCALES, isLocale } from '../i18n/locales.js';
import type { Locale } from '../i18n/locales.js';

export type AutoplayMode = 'related' | 'seed';

export const AUTOPLAY_MODES: readonly AutoplayMode[] = ['related', 'seed'];

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
}

/**
 * Implementations never rely on a particular backend being reachable: get() falls back to the last known or
 * default settings, update() rejects only for an invalid patch (RangeError from validateSettingsPatch).
 */
export interface GuildSettingsStore {
  get(guildId: string): Promise<GuildSettings>;
  update(guildId: string, patch: Partial<GuildSettings>): Promise<GuildSettings>;
  reset(guildId: string): Promise<void>;
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
  };
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
}
