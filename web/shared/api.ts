import { z } from 'zod';
import {
  automodBodySchemas,
  automodInvitesSchema,
  automodKeywordsSchema,
  automodMentionsSchema,
  automodPresetsSchema,
  AUTOMOD_KINDS,
  guildMetaSchema,
} from '../../src/bridge/protocol.js';
import {
  LEVEL_REWARD_MAX_LEVEL,
  LEVEL_REWARDS_MAX,
  MAX_VOLUME,
  WEB_LEADERBOARD_PAGE_MAX,
  WEB_PUBLIC_LEADERBOARD_PAGE_MAX,
  XP_IGNORED_MAX,
  XP_MULTIPLIER_MAX_PERCENT,
  XP_MULTIPLIER_MIN_PERCENT,
} from '../../src/config/constants.js';
import { LOCALES } from '../../src/i18n/locales.js';
import type { Locale } from '../../src/i18n/locales.js';
import { AUTOPLAY_MODES, LEVEL_REWARD_MODES, LEVEL_UP_MODES } from '../../src/settings/guild-settings.js';
import type { GuildSettings } from '../../src/settings/guild-settings.js';

/**
 * Request and response shapes of the web API (design 4.13). The same zod schemas validate on the server (the trust
 * boundary) and give the dashboard forms instant feedback. Every request object is strict: unknown keys fail.
 */

export {
  LEVEL_REWARD_MAX_LEVEL,
  LEVEL_REWARDS_MAX,
  MAX_VOLUME,
  XP_IGNORED_MAX,
  XP_MULTIPLIER_MAX_PERCENT,
  XP_MULTIPLIER_MIN_PERCENT,
};
export {
  AUTOMOD_EXEMPT_CHANNELS_MAX,
  AUTOMOD_EXEMPT_ROLES_MAX,
  AUTOMOD_KEYWORD_ALLOW_MAX,
  AUTOMOD_KEYWORDS_MAX,
  AUTOMOD_MENTION_LIMIT_MAX,
  AUTOMOD_PRESET_ALLOW_MAX,
  AUTOMOD_TIMEOUT_MAX_SECONDS,
  AUTOMOD_WORD_MAX_LENGTH,
} from '../../src/bridge/protocol.js';
export {
  automodBodySchemas,
  automodInvitesSchema,
  automodKeywordsSchema,
  automodMentionsSchema,
  automodPresetsSchema,
  AUTOMOD_KINDS,
  guildMetaSchema,
};
export type {
  AutomodBodies,
  AutomodInvites,
  AutomodKeywords,
  AutomodKind,
  AutomodList,
  AutomodMentions,
  AutomodPresets,
  AutomodRule,
  AutomodRules,
  GuildMeta,
  GuildMetaChannel,
  GuildMetaRole,
} from '../../src/bridge/protocol.js';
export type { GuildSettings, Locale };

export const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord snowflake');

function uniqueSnowflakes(max: number) {
  return z
    .array(snowflake)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'must not contain duplicates' });
}

const nonEmpty = { message: 'at least one field is required' };
const hasKeys = (value: object): boolean => Object.keys(value).length > 0;

export const generalPatchSchema = z
  .strictObject({
    language: z.enum(LOCALES).nullable().optional(),
    djRoleId: snowflake.nullable().optional(),
    defaultVolume: z.number().int().min(0).max(MAX_VOLUME).optional(),
    autoplayEnabled: z.boolean().optional(),
    autoplayMode: z.enum(AUTOPLAY_MODES as readonly ['related', 'seed']).optional(),
    twentyFourSeven: z.boolean().optional(),
  })
  .refine(hasKeys, nonEmpty);
export type GeneralPatch = z.infer<typeof generalPatchSchema>;

export const moderationPatchSchema = z
  .strictObject({
    modLogChannelId: snowflake.nullable().optional(),
    modDmTarget: z.boolean().optional(),
  })
  .refine(hasKeys, nonEmpty);
export type ModerationPatch = z.infer<typeof moderationPatchSchema>;

export const levelingPatchSchema = z
  .strictObject({
    levelingEnabled: z.boolean().optional(),
    xpMultiplierPercent: z.number().int().min(XP_MULTIPLIER_MIN_PERCENT).max(XP_MULTIPLIER_MAX_PERCENT).optional(),
    levelUpMode: z.enum(LEVEL_UP_MODES as readonly ['off', 'current', 'channel', 'dm']).optional(),
    levelUpChannelId: snowflake.nullable().optional(),
    xpIgnoredChannelIds: uniqueSnowflakes(XP_IGNORED_MAX).optional(),
    xpIgnoredRoleIds: uniqueSnowflakes(XP_IGNORED_MAX).optional(),
    levelRewardMode: z.enum(LEVEL_REWARD_MODES as readonly ['stack', 'highest']).optional(),
    leaderboardPublic: z.boolean().optional(),
  })
  .refine(hasKeys, nonEmpty);
export type LevelingPatch = z.infer<typeof levelingPatchSchema>;

export const rewardSchema = z.strictObject({
  level: z.number().int().min(1).max(LEVEL_REWARD_MAX_LEVEL),
  roleId: snowflake,
});
export type Reward = z.infer<typeof rewardSchema>;

export const rewardsPutSchema = z
  .strictObject({ rewards: z.array(rewardSchema).max(LEVEL_REWARDS_MAX) })
  .superRefine((value, ctx) => {
    const levels = new Set<number>();
    const roles = new Set<string>();
    value.rewards.forEach((reward, index) => {
      if (levels.has(reward.level)) {
        ctx.addIssue({ code: 'custom', path: ['rewards', index, 'level'], message: 'each level can have one reward' });
      }
      if (roles.has(reward.roleId)) {
        ctx.addIssue({ code: 'custom', path: ['rewards', index, 'roleId'], message: 'each role can be used once' });
      }
      levels.add(reward.level);
      roles.add(reward.roleId);
    });
  });
export type RewardsPut = z.infer<typeof rewardsPutSchema>;

/** POST /auth/logout: no body at all, or exactly {}. */
export const logoutBodySchema = z.strictObject({});

export const guildParamsSchema = z.strictObject({ guildId: snowflake });
export const automodParamsSchema = z.strictObject({ guildId: snowflake, kind: z.enum(AUTOMOD_KINDS) });

/** Query strings are parsed from URLSearchParams entries (strings). */
export const emptyQuerySchema = z.object({});
export const discordQuerySchema = z.object({ refresh: z.literal('1').optional() });
export const leaderboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(WEB_LEADERBOARD_PAGE_MAX).default(1),
});
export const publicLeaderboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(WEB_PUBLIC_LEADERBOARD_PAGE_MAX).default(1),
});

/** Error codes of the API and their HTTP status. */
export const API_ERROR_STATUS = {
  invalid_body: 400,
  invalid_params: 400,
  unauthorized: 401,
  session_expired: 401,
  forbidden: 403,
  csrf_failed: 403,
  not_found: 404,
  bot_not_in_guild: 404,
  bot_missing_permission: 409,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  discord_rejected: 422,
  rate_limited: 429,
  internal_error: 500,
  discord_unavailable: 502,
  storage_unavailable: 503,
  schema_outdated: 503,
  discord_rate_limited: 503,
  bot_unavailable: 503,
} as const;
export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

/** Issue codes of the semantic checks (besides zod's own). */
export const ISSUE_CODES = [
  'unknown_channel',
  'unknown_role',
  'wrong_channel_type',
  'bot_cannot_post',
  'role_everyone',
  'role_managed',
  'role_not_assignable',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export interface Issue {
  path: string;
  message: string;
  code?: IssueCode;
}

export interface ErrorBody {
  error: ApiErrorCode;
  message?: string;
  issues?: Issue[];
  inviteUrl?: string;
  /** Discord's numeric error code for discord_rejected. */
  code?: number;
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && Object.hasOwn(API_ERROR_STATUS, value);
}

/** zod issues as `{ path, message }` (paths joined with dots, e.g. rewards.3.roleId). */
export function zodIssues(error: z.ZodError): Issue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

export interface SessionUser {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string;
}

export interface SessionResponse {
  user: SessionUser;
  csrfToken: string;
  locale: Locale;
  defaultLocale: Locale;
}

export interface GuildListItem {
  id: string;
  name: string;
  iconUrl: string | null;
  botPresent: boolean;
  inviteUrl: string | null;
}

export type GeneralSettings = Pick<
  GuildSettings,
  'language' | 'djRoleId' | 'defaultVolume' | 'autoplayEnabled' | 'autoplayMode' | 'twentyFourSeven'
>;
export type ModerationSettings = Pick<GuildSettings, 'modLogChannelId' | 'modDmTarget'>;
export type LevelingSettings = Pick<
  GuildSettings,
  | 'levelingEnabled'
  | 'xpMultiplierPercent'
  | 'levelUpMode'
  | 'levelUpChannelId'
  | 'xpIgnoredChannelIds'
  | 'xpIgnoredRoleIds'
  | 'levelRewardMode'
  | 'leaderboardPublic'
>;

export function generalView(s: GuildSettings): GeneralSettings {
  return {
    language: s.language,
    djRoleId: s.djRoleId,
    defaultVolume: s.defaultVolume,
    autoplayEnabled: s.autoplayEnabled,
    autoplayMode: s.autoplayMode,
    twentyFourSeven: s.twentyFourSeven,
  };
}

export function moderationView(s: GuildSettings): ModerationSettings {
  return { modLogChannelId: s.modLogChannelId, modDmTarget: s.modDmTarget };
}

export function levelingView(s: GuildSettings): LevelingSettings {
  return {
    levelingEnabled: s.levelingEnabled,
    xpMultiplierPercent: s.xpMultiplierPercent,
    levelUpMode: s.levelUpMode,
    levelUpChannelId: s.levelUpChannelId,
    xpIgnoredChannelIds: [...s.xpIgnoredChannelIds],
    xpIgnoredRoleIds: [...s.xpIgnoredRoleIds],
    levelRewardMode: s.levelRewardMode,
    leaderboardPublic: s.leaderboardPublic,
  };
}

export interface GuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
}

export interface GuildSettingsResponse {
  guild: GuildSummary;
  general: GeneralSettings;
  moderation: ModerationSettings;
  leveling: LevelingSettings & { rewards: Reward[] };
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string | null;
  avatarUrl: string;
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
}

export interface Leaderboard {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  entries: LeaderboardEntry[];
}

export interface PublicLeaderboard extends Leaderboard {
  guild: { name: string; iconUrl: string | null };
}
