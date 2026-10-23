import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TargetCheckInput, TargetCheckResult } from './target-check.js';
import { checkModerationTarget } from './target-check.js';

const INVOKER = '100000000000000001';
const TARGET = '100000000000000002';
const BOT = '100000000000000003';
const OWNER = '100000000000000004';

const base: TargetCheckInput = {
  action: 'kick',
  invokerId: INVOKER,
  targetId: TARGET,
  botId: BOT,
  ownerId: OWNER,
  member: { invokerVsTarget: 1, botVsTarget: 1, isAdministrator: false },
};

const below = { invokerVsTarget: 1, botVsTarget: 1, isAdministrator: false };

// The 13 rows of design 4.6.1 (acceptance 4).
const rows: { name: string; input: Partial<TargetCheckInput>; expected: TargetCheckResult }[] = [
  { name: 'self', input: { targetId: INVOKER }, expected: { ok: false, reason: 'self' } },
  { name: 'bot', input: { targetId: BOT }, expected: { ok: false, reason: 'bot' } },
  { name: 'owner', input: { targetId: OWNER }, expected: { ok: false, reason: 'owner' } },
  { name: 'kick a non-member', input: { action: 'kick', member: null }, expected: { ok: false, reason: 'notMember' } },
  {
    name: 'invoker below the target',
    input: { member: { ...below, invokerVsTarget: -1 } },
    expected: { ok: false, reason: 'invokerNotHigher' },
  },
  {
    name: 'invoker equal to the target',
    input: { member: { ...below, invokerVsTarget: 0 } },
    expected: { ok: false, reason: 'invokerNotHigher' },
  },
  {
    name: 'owner invoker below the target (allowed)',
    input: { invokerId: OWNER, ownerId: OWNER, member: { ...below, invokerVsTarget: -1 } },
    expected: { ok: true },
  },
  {
    name: 'bot below the target',
    input: { member: { ...below, botVsTarget: -1 } },
    expected: { ok: false, reason: 'botNotHigher' },
  },
  {
    name: 'timeout an administrator',
    input: { action: 'timeout', member: { ...below, isAdministrator: true } },
    expected: { ok: false, reason: 'targetAdmin' },
  },
  { name: 'ban a non-member by id (allowed)', input: { action: 'ban', member: null }, expected: { ok: true } },
  { name: 'warn a lower member (allowed)', input: { action: 'warn', member: below }, expected: { ok: true } },
  {
    name: 'warn a non-member (refused)',
    input: { action: 'warn', member: null },
    expected: { ok: false, reason: 'notMember' },
  },
  {
    name: 'untimeout a higher member (refused)',
    input: { action: 'untimeout', member: { ...below, invokerVsTarget: -1 } },
    expected: { ok: false, reason: 'invokerNotHigher' },
  },
];

describe('checkModerationTarget', () => {
  for (const row of rows) {
    it(row.name, () => {
      assert.deepEqual(checkModerationTarget({ ...base, ...row.input }), row.expected);
    });
  }

  it('has the 13 rows of the design table', () => {
    assert.equal(rows.length, 13);
  });

  it('applies the rules in order', () => {
    // The owner as target wins over a missing member and a lower invoker.
    assert.deepEqual(checkModerationTarget({ ...base, targetId: OWNER, member: null }), { ok: false, reason: 'owner' });
    // The invoker check comes before the bot check.
    assert.deepEqual(
      checkModerationTarget({ ...base, member: { invokerVsTarget: 0, botVsTarget: 0, isAdministrator: false } }),
      { ok: false, reason: 'invokerNotHigher' },
    );
    // Administrators may be kicked or banned when the hierarchy allows it; only timeouts refuse them.
    assert.deepEqual(checkModerationTarget({ ...base, action: 'ban', member: { ...below, isAdministrator: true } }), {
      ok: true,
    });
    // Unban targets are never members.
    assert.deepEqual(checkModerationTarget({ ...base, action: 'unban', member: null }), { ok: true });
  });
});
