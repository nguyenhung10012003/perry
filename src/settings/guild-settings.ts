import {
  DEFAULT_VOLUME,
  MAX_VOLUME,
  XP_IGNORED_MAX,
  XP_MULTIPLIER_MAX_PERCENT,
  XP_MULTIPLIER_MIN_PERCENT,
} from '../config/constants.js';
import { LOCALES, isLocale } from '../i18n/locales.js';
import type { Locale } from '../i18n/locales.js';

export type AutoplayMode = 'related' | 'seed';

export const AUTOPLAY_MODES: readonly AutoplayMode[] = ['related', 'seed'];

/** Where level-up messages go: nowhere, the channel of the message, the configured channel, or a DM. */
export type LevelUpMode = 'off' | 'current' | 'channel' | 'dm';

export const LEVEL_UP_MODES: readonly LevelUpMode[] = ['off', 'current', 'channel', 'dm'];

/** Role rewards: keep every reward up to the level (stack) or only the highest one (DP-3 (c)). */
export type LevelRewardMode = 'stack' | 'highest';

export const LEVEL_REWARD_MODES: readonly LevelRewardMode[] = ['stack', 'highest'];

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
  /** Messages earn XP (off until a manager enables it, A10). */
  levelingEnabled: boolean;
  /** XP multiplier in percent, integer 10..500. */
  xpMultiplierPercent: number;
  levelUpMode: LevelUpMode;
  /** Channel for level-up messages in mode 'channel'; null = not set. */
  levelUpChannelId: string | null;
  /**
   * Channels (also covering their threads and, for a category, its channels) and roles that earn no XP; at most
   * XP_IGNORED_MAX each. Readonly because get() returns shallow copies that share arrays with the cache.
   */
  xpIgnoredChannelIds: readonly string[];
  xpIgnoredRoleIds: readonly string[];
  levelRewardMode: LevelRewardMode;
  /** Public leaderboard page on the web (DP-5 (b)). */
  leaderboardPublic: boolean;
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
    levelingEnabled: false,
    xpMultiplierPercent: 100,
    levelUpMode: 'current',
    levelUpChannelId: null,
    xpIgnoredChannelIds: [],
    xpIgnoredRoleIds: [],
    levelRewardMode: 'stack',
    leaderboardPublic: false,
  };
}

/**
 * Pure: the patch that removes ref from settings ({} when nothing refers to it). Used by the memory store and the
 * outage fallback of the persistent store. defaultTextChannelId/defaultVoiceChannelId are left alone (never read).
 */
export function referencePatch(settings: GuildSettings, ref: SettingsReference): Partial<GuildSettings> {
  const patch: Partial<GuildSettings> = {};
  if ('channelId' in ref) {
    const { channelId } = ref;
    if (settings.modLogChannelId === channelId) patch.modLogChannelId = null;
    if (settings.levelUpChannelId === channelId) patch.levelUpChannelId = null;
    if (settings.xpIgnoredChannelIds.includes(channelId)) {
      patch.xpIgnoredChannelIds = settings.xpIgnoredChannelIds.filter((id) => id !== channelId);
    }
  } else {
    const { roleId } = ref;
    if (settings.djRoleId === roleId) patch.djRoleId = null;
    if (settings.xpIgnoredRoleIds.includes(roleId)) {
      patch.xpIgnoredRoleIds = settings.xpIgnoredRoleIds.filter((id) => id !== roleId);
    }
  }
  return patch;
}

function isSnowflakeOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'string' && SNOWFLAKE_RE.test(value));
}

/** At most XP_IGNORED_MAX unique snowflakes. */
function isIgnoredList(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > XP_IGNORED_MAX) return false;
  const ids: unknown[] = value;
  return ids.every((id) => typeof id === 'string' && SNOWFLAKE_RE.test(id)) && new Set(ids).size === ids.length;
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
  if (patch.levelingEnabled !== undefined && typeof patch.levelingEnabled !== 'boolean') {
    throw new RangeError('levelingEnabled must be a boolean');
  }
  if (patch.leaderboardPublic !== undefined && typeof patch.leaderboardPublic !== 'boolean') {
    throw new RangeError('leaderboardPublic must be a boolean');
  }
  if (
    patch.xpMultiplierPercent !== undefined &&
    (!Number.isInteger(patch.xpMultiplierPercent) ||
      patch.xpMultiplierPercent < XP_MULTIPLIER_MIN_PERCENT ||
      patch.xpMultiplierPercent > XP_MULTIPLIER_MAX_PERCENT)
  ) {
    throw new RangeError(
      `xpMultiplierPercent must be an integer between ${XP_MULTIPLIER_MIN_PERCENT} and ${XP_MULTIPLIER_MAX_PERCENT}`,
    );
  }
  if (patch.levelUpMode !== undefined && !LEVEL_UP_MODES.includes(patch.levelUpMode)) {
    throw new RangeError(`levelUpMode must be one of: ${LEVEL_UP_MODES.join(', ')}`);
  }
  if (patch.levelUpChannelId !== undefined && !isSnowflakeOrNull(patch.levelUpChannelId)) {
    throw new RangeError('levelUpChannelId must be null or a Discord snowflake');
  }
  if (patch.xpIgnoredChannelIds !== undefined && !isIgnoredList(patch.xpIgnoredChannelIds)) {
    throw new RangeError(`xpIgnoredChannelIds must hold at most ${XP_IGNORED_MAX} unique Discord snowflakes`);
  }
  if (patch.xpIgnoredRoleIds !== undefined && !isIgnoredList(patch.xpIgnoredRoleIds)) {
    throw new RangeError(`xpIgnoredRoleIds must hold at most ${XP_IGNORED_MAX} unique Discord snowflakes`);
  }
  if (patch.levelRewardMode !== undefined && !LEVEL_REWARD_MODES.includes(patch.levelRewardMode)) {
    throw new RangeError(`levelRewardMode must be one of: ${LEVEL_REWARD_MODES.join(', ')}`);
  }
}
