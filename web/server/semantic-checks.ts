import 'server-only';
import type { GuildMeta } from '../../src/bridge/protocol.js';
import type { GuildSettings } from '../../src/settings/guild-settings.js';
import type { LevelReward } from '../../src/storage/types.js';
import type { Issue, IssueCode } from '../shared/api.js';
import { POSTABLE_CHANNEL_TYPES } from '../shared/discord.js';

/**
 * Semantic checks after zod (design 4.13), pure. Each id field is split into kept ids (already stored) and added ids:
 * kept ids that no longer exist in the guild are dropped silently (a stale id must not block every later save, G11);
 * added ids must exist and fit the field, else a 400 issue with the field path and an issue code.
 */

const ANY_LISTED_TYPE: readonly number[] = [0, 2, 4, 5, 13, 15, 16];

const MESSAGES: Record<IssueCode, string> = {
  unknown_channel: 'unknown channel',
  unknown_role: 'unknown role',
  wrong_channel_type: 'must be a text or announcement channel',
  bot_cannot_post: 'the bot cannot post embeds in this channel',
  role_everyone: 'the @everyone role is not allowed',
  role_managed: 'managed roles are not allowed',
  role_not_assignable: "the role is above the bot's highest role",
};

function issue(path: string, code: IssueCode): Issue {
  return { path, code, message: MESSAGES[code] };
}

interface ChannelRule {
  types: readonly number[];
  requirePost: boolean;
}

interface RoleRule {
  allowManaged: boolean;
  requireAssignable: boolean;
}

function channelProblem(meta: GuildMeta, id: string, rule: ChannelRule): IssueCode | null {
  const channel = meta.channels.find((candidate) => candidate.id === id);
  if (channel === undefined) return 'unknown_channel';
  if (!rule.types.includes(channel.type)) return 'wrong_channel_type';
  if (rule.requirePost && !channel.botCanPost) return 'bot_cannot_post';
  return null;
}

function roleProblem(meta: GuildMeta, guildId: string, id: string, rule: RoleRule): IssueCode | null {
  const role = meta.roles.find((candidate) => candidate.id === id);
  if (role === undefined) return 'unknown_role';
  if (id === guildId) return 'role_everyone';
  if (!rule.allowManaged && role.managed) return 'role_managed';
  if (rule.requireAssignable && !role.assignable) return 'role_not_assignable';
  return null;
}

const channelExists = (meta: GuildMeta, id: string) => meta.channels.some((channel) => channel.id === id);
const roleExists = (meta: GuildMeta, id: string) => meta.roles.some((role) => role.id === id);

type Kind = { kind: 'channel'; rule: ChannelRule } | { kind: 'role'; rule: RoleRule };

function exists(meta: GuildMeta, kind: Kind, id: string): boolean {
  return kind.kind === 'channel' ? channelExists(meta, id) : roleExists(meta, id);
}

function problem(meta: GuildMeta, guildId: string, kind: Kind, id: string): IssueCode | null {
  return kind.kind === 'channel' ? channelProblem(meta, id, kind.rule) : roleProblem(meta, guildId, id, kind.rule);
}

/** A nullable id field: an unchanged stored value is kept (or nulled when gone), a new value must pass the rule. */
function checkScalar(
  meta: GuildMeta,
  guildId: string,
  path: string,
  stored: string | null,
  next: string | null,
  kind: Kind,
  issues: Issue[],
): string | null {
  if (next === null) return null;
  if (next === stored) return exists(meta, kind, next) ? next : null;
  const code = problem(meta, guildId, kind, next);
  if (code !== null) issues.push(issue(path, code));
  return next;
}

/** An id list: stored ids that are gone are dropped, new ids must pass the rule. */
function checkList(
  meta: GuildMeta,
  guildId: string,
  path: string,
  stored: readonly string[],
  next: readonly string[],
  kind: Kind,
  issues: Issue[],
): string[] {
  const kept = new Set(stored);
  const result: string[] = [];
  next.forEach((id, index) => {
    if (kept.has(id)) {
      if (exists(meta, kind, id)) result.push(id);
      return;
    }
    const code = problem(meta, guildId, kind, id);
    if (code !== null) issues.push(issue(`${path}.${index}`, code));
    result.push(id);
  });
  return result;
}

const POST_CHANNEL: Kind = { kind: 'channel', rule: { types: POSTABLE_CHANNEL_TYPES, requirePost: true } };
const ANY_CHANNEL: Kind = { kind: 'channel', rule: { types: ANY_LISTED_TYPE, requirePost: false } };
const ALERT_CHANNEL: Kind = { kind: 'channel', rule: { types: POSTABLE_CHANNEL_TYPES, requirePost: false } };
const DJ_ROLE: Kind = { kind: 'role', rule: { allowManaged: false, requireAssignable: false } };
const ANY_ROLE: Kind = { kind: 'role', rule: { allowManaged: true, requireAssignable: false } };
const REWARD_ROLE: Kind = { kind: 'role', rule: { allowManaged: false, requireAssignable: true } };

export interface Checked<T> {
  value: T;
  issues: Issue[];
}

/** True when the patch carries a channel or role id, so the guild data must be fetched for the checks. */
export function patchNeedsGuildData(patch: Partial<GuildSettings>): boolean {
  return (
    (patch.djRoleId !== undefined && patch.djRoleId !== null) ||
    (patch.modLogChannelId !== undefined && patch.modLogChannelId !== null) ||
    (patch.levelUpChannelId !== undefined && patch.levelUpChannelId !== null) ||
    (patch.xpIgnoredChannelIds !== undefined && patch.xpIgnoredChannelIds.length > 0) ||
    (patch.xpIgnoredRoleIds !== undefined && patch.xpIgnoredRoleIds.length > 0)
  );
}

/** Settings patch of routes 12-14. meta may be null only when patchNeedsGuildData(patch) is false. */
export function checkGuildPatch(
  guildId: string,
  stored: GuildSettings,
  meta: GuildMeta | null,
  patch: Partial<GuildSettings>,
): Checked<Partial<GuildSettings>> {
  const issues: Issue[] = [];
  const value: Partial<GuildSettings> = { ...patch };
  if (meta === null) {
    if (patchNeedsGuildData(patch)) throw new Error('checkGuildPatch needs the guild data for this patch');
    return { value, issues };
  }
  if (patch.djRoleId !== undefined) {
    value.djRoleId = checkScalar(meta, guildId, 'djRoleId', stored.djRoleId, patch.djRoleId, DJ_ROLE, issues);
  }
  if (patch.modLogChannelId !== undefined) {
    value.modLogChannelId = checkScalar(
      meta,
      guildId,
      'modLogChannelId',
      stored.modLogChannelId,
      patch.modLogChannelId,
      POST_CHANNEL,
      issues,
    );
  }
  if (patch.levelUpChannelId !== undefined) {
    value.levelUpChannelId = checkScalar(
      meta,
      guildId,
      'levelUpChannelId',
      stored.levelUpChannelId,
      patch.levelUpChannelId,
      POST_CHANNEL,
      issues,
    );
  }
  if (patch.xpIgnoredChannelIds !== undefined) {
    value.xpIgnoredChannelIds = checkList(
      meta,
      guildId,
      'xpIgnoredChannelIds',
      stored.xpIgnoredChannelIds,
      patch.xpIgnoredChannelIds,
      ANY_CHANNEL,
      issues,
    );
  }
  if (patch.xpIgnoredRoleIds !== undefined) {
    value.xpIgnoredRoleIds = checkList(
      meta,
      guildId,
      'xpIgnoredRoleIds',
      stored.xpIgnoredRoleIds,
      patch.xpIgnoredRoleIds,
      ANY_ROLE,
      issues,
    );
  }
  return { value, issues };
}

/** Rewards of route 15: a stored reward role that is gone is dropped; new reward roles must be assignable. */
export function checkRewards(
  guildId: string,
  stored: readonly LevelReward[],
  meta: GuildMeta,
  rewards: readonly LevelReward[],
): Checked<LevelReward[]> {
  const issues: Issue[] = [];
  const kept = new Set(stored.map((reward) => reward.roleId));
  const value: LevelReward[] = [];
  rewards.forEach((reward, index) => {
    if (kept.has(reward.roleId)) {
      if (roleExists(meta, reward.roleId)) value.push({ level: reward.level, roleId: reward.roleId });
      return;
    }
    const code = problem(meta, guildId, REWARD_ROLE, reward.roleId);
    if (code !== null) issues.push(issue(`rewards.${index}.roleId`, code));
    value.push({ level: reward.level, roleId: reward.roleId });
  });
  return { value, issues };
}

/** The id fields every AutoMod rule body has. */
export interface AutomodIds {
  alertChannelId: string | null;
  exemptRoleIds: string[];
  exemptChannelIds: string[];
}

/**
 * AutoMod body of route 18. The stored ids are those of the guild's current Perry rule of that kind (null: none, so
 * every id is added). The alert channel is a text or announcement channel (Discord posts the alert itself); exempt
 * channels may have any listed type.
 */
export function checkAutomodBody<T extends AutomodIds>(
  guildId: string,
  stored: AutomodIds | null,
  meta: GuildMeta,
  body: T,
): Checked<T> {
  const issues: Issue[] = [];
  const value: T = {
    ...body,
    alertChannelId: checkScalar(
      meta,
      guildId,
      'alertChannelId',
      stored?.alertChannelId ?? null,
      body.alertChannelId,
      ALERT_CHANNEL,
      issues,
    ),
    exemptRoleIds: checkList(meta, guildId, 'exemptRoleIds', stored?.exemptRoleIds ?? [], body.exemptRoleIds, ANY_ROLE, issues),
    exemptChannelIds: checkList(
      meta,
      guildId,
      'exemptChannelIds',
      stored?.exemptChannelIds ?? [],
      body.exemptChannelIds,
      ANY_CHANNEL,
      issues,
    ),
  };
  return { value, issues };
}
