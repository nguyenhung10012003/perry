import type { MOD_ACTIONS } from '../storage/postgres/schema.js';

export type ModAction = (typeof MOD_ACTIONS)[number];

export interface TargetCheckInput {
  action: ModAction;
  invokerId: string;
  targetId: string;
  botId: string;
  ownerId: string;
  /** Null when the target is not a member (ban or unban by id). Signs come from Role.comparePositionTo. */
  member: {
    invokerVsTarget: number;
    botVsTarget: number;
    isAdministrator: boolean;
  } | null;
}

export type TargetCheckFailure =
  | 'self'
  | 'bot'
  | 'owner'
  | 'notMember'
  | 'invokerNotHigher'
  | 'botNotHigher'
  | 'targetAdmin';

export type TargetCheckResult = { ok: true } | { ok: false; reason: TargetCheckFailure };

/** Actions that need the target to be a current member (A9: a warning always passes the hierarchy rules). */
const MEMBER_ACTIONS: ReadonlySet<ModAction> = new Set<ModAction>(['kick', 'timeout', 'untimeout', 'warn']);

const fail = (reason: TargetCheckFailure): TargetCheckResult => ({ ok: false, reason });

/**
 * Pure role-hierarchy rules of a moderation action, in this order: self, bot, owner, not a member (kick, timeout,
 * untimeout, warn), invoker not above the target (unless the invoker owns the server), bot not above the target,
 * timeout of an Administrator. comparePositionTo breaks equal positions by role id, as Discord does.
 */
export function checkModerationTarget(input: TargetCheckInput): TargetCheckResult {
  if (input.targetId === input.invokerId) return fail('self');
  if (input.targetId === input.botId) return fail('bot');
  if (input.targetId === input.ownerId) return fail('owner');
  const { member } = input;
  if (member === null) return MEMBER_ACTIONS.has(input.action) ? fail('notMember') : { ok: true };
  if (input.invokerId !== input.ownerId && member.invokerVsTarget <= 0) return fail('invokerNotHigher');
  if (member.botVsTarget <= 0) return fail('botNotHigher');
  if (input.action === 'timeout' && member.isAdministrator) return fail('targetAdmin');
  return { ok: true };
}
