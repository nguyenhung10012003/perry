import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LevelRewardMode } from '../settings/guild-settings.js';
import { rewardDiff } from './rewards.js';

const A = '100000000000000001';
const B = '100000000000000002';
const C = '100000000000000003';
const UNRELATED = '900000000000000001';

const diff = (
  mode: LevelRewardMode,
  rewards: { level: number; roleId: string }[],
  level: number,
  member: string[],
): { add: string[]; remove: string[] } => rewardDiff({ rewards, level, mode, memberRoleIds: new Set(member) });

describe('rewardDiff', () => {
  // Acceptance 15: the table of design 4.7.5.
  const twoRewards = [
    { level: 5, roleId: A },
    { level: 10, roleId: B },
  ];

  it('stack, level 10 with A: adds B', () => {
    assert.deepEqual(diff('stack', twoRewards, 10, [A]), { add: [B], remove: [] });
  });

  it('highest, level 10 with A: adds B and removes A', () => {
    assert.deepEqual(diff('highest', twoRewards, 10, [A]), { add: [B], remove: [A] });
  });

  it('stack, level 7 after /xp set with A and B: removes B', () => {
    assert.deepEqual(diff('stack', twoRewards, 7, [A, B]), { add: [], remove: [B] });
  });

  it('highest, level 3 with A: removes A', () => {
    assert.deepEqual(diff('highest', [{ level: 5, roleId: A }], 3, [A]), { add: [], remove: [A] });
  });

  for (const mode of ['stack', 'highest'] as const) {
    it(`${mode}, level 4 without rewards reached: changes nothing`, () => {
      assert.deepEqual(diff(mode, [{ level: 5, roleId: A }], 4, []), { add: [], remove: [] });
    });
  }

  it('a multi-level jump adds every crossed reward in stack mode', () => {
    const rewards = [...twoRewards, { level: 20, roleId: C }];
    assert.deepEqual(diff('stack', rewards, 25, []), { add: [A, B, C], remove: [] });
    assert.deepEqual(diff('highest', rewards, 25, []), { add: [C], remove: [] });
  });

  it('level 0 (after /xp set 0 or reset) removes every reward role', () => {
    assert.deepEqual(diff('stack', twoRewards, 0, [A, B, UNRELATED]), { add: [], remove: [A, B] });
  });

  it('never touches roles that are not rewards', () => {
    const result = diff('highest', twoRewards, 10, [A, B, UNRELATED]);
    assert.deepEqual(result, { add: [], remove: [A] });
    assert.ok(!result.remove.includes(UNRELATED));
  });

  it('works with rewards in any order', () => {
    const reversed = [...twoRewards].reverse();
    assert.deepEqual(diff('highest', reversed, 10, []), { add: [B], remove: [] });
  });
});
