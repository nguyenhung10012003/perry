import type { LevelRewardMode } from '../settings/guild-settings.js';

export interface RewardDiffInput {
  rewards: readonly { level: number; roleId: string }[];
  level: number;
  mode: LevelRewardMode;
  memberRoleIds: ReadonlySet<string>;
}

/**
 * Pure: the reward roles to add and to remove for a member at `level` (DP-3 (c)). Desired roles: in stack mode
 * every reward with level <= current, in highest mode only the reward with the largest such level. `remove` holds
 * reward roles the member has that are not desired (highest mode, or a level decrease after /xp). Roles that are
 * not rewards are never touched.
 */
export function rewardDiff(input: RewardDiffInput): { add: string[]; remove: string[] } {
  const reached = input.rewards.filter((reward) => reward.level <= input.level);
  let desired = reached;
  if (input.mode === 'highest' && reached.length > 0) {
    const top = reached.reduce((best, reward) => (reward.level > best.level ? reward : best));
    desired = [top];
  }
  const desiredIds = new Set(desired.map((reward) => reward.roleId));
  const add = [...desiredIds].filter((roleId) => !input.memberRoleIds.has(roleId));
  const remove = [...new Set(input.rewards.map((reward) => reward.roleId))].filter(
    (roleId) => !desiredIds.has(roleId) && input.memberRoleIds.has(roleId),
  );
  return { add, remove };
}
