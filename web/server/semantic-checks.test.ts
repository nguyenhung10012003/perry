import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultSettings } from '../../src/settings/guild-settings.js';
import { checkAutomodBody, checkGuildPatch, checkRewards, patchNeedsGuildData } from './semantic-checks.js';
import { fakeGuildMeta } from './testing/fakes.js';

const GUILD = '100000000000000001';
const meta = fakeGuildMeta(GUILD);
const GENERAL = '300000000000000001';
const READ_ONLY = '300000000000000002';
const VOICE = '300000000000000003';
const NEWS = '300000000000000004';
const CATEGORY = '300000000000000005';
const GONE = '399999999999999999';
const MEMBER = '400000000000000001';
const PERRY = '400000000000000002';
const ADMIN = '400000000000000003';
const REGULAR = '400000000000000004';

const codes = (issues: { path: string; code?: string }[]) => issues.map((issue) => `${issue.path}:${issue.code}`);

describe('checkGuildPatch', () => {
  it('mod log and level-up channels: postable text or announcement channels only', () => {
    const stored = defaultSettings();
    assert.deepEqual(checkGuildPatch(GUILD, stored, meta, { modLogChannelId: GENERAL }).issues, []);
    assert.deepEqual(checkGuildPatch(GUILD, stored, meta, { levelUpChannelId: NEWS }).issues, []);
    assert.deepEqual(codes(checkGuildPatch(GUILD, stored, meta, { modLogChannelId: READ_ONLY }).issues), [
      'modLogChannelId:bot_cannot_post',
    ]);
    assert.deepEqual(codes(checkGuildPatch(GUILD, stored, meta, { modLogChannelId: VOICE }).issues), [
      'modLogChannelId:wrong_channel_type',
    ]);
    assert.deepEqual(codes(checkGuildPatch(GUILD, stored, meta, { levelUpChannelId: GONE }).issues), [
      'levelUpChannelId:unknown_channel',
    ]);
  });

  it('a stored channel that no longer exists is cleared silently', () => {
    const stored = { ...defaultSettings(), modLogChannelId: GONE };
    const checked = checkGuildPatch(GUILD, stored, meta, { modLogChannelId: GONE, modDmTarget: false });
    assert.deepEqual(checked.issues, []);
    assert.equal(checked.value.modLogChannelId, null);
    assert.equal(checked.value.modDmTarget, false);
  });

  it('DJ role: not @everyone and not managed', () => {
    const stored = defaultSettings();
    assert.deepEqual(checkGuildPatch(GUILD, stored, meta, { djRoleId: MEMBER }).issues, []);
    assert.deepEqual(codes(checkGuildPatch(GUILD, stored, meta, { djRoleId: GUILD }).issues), ['djRoleId:role_everyone']);
    assert.deepEqual(codes(checkGuildPatch(GUILD, stored, meta, { djRoleId: PERRY }).issues), ['djRoleId:role_managed']);
    assert.deepEqual(codes(checkGuildPatch(GUILD, stored, meta, { djRoleId: GONE }).issues), ['djRoleId:unknown_role']);
  });

  it('acceptance 25a: kept stale ids are dropped, added unknown ids are rejected', () => {
    const stored = { ...defaultSettings(), xpIgnoredChannelIds: [GONE] };
    const kept = checkGuildPatch(GUILD, stored, meta, { xpIgnoredChannelIds: [GONE, VOICE, CATEGORY] });
    assert.deepEqual(kept.issues, []);
    assert.deepEqual(kept.value.xpIgnoredChannelIds, [VOICE, CATEGORY]);
    const added = checkGuildPatch(GUILD, defaultSettings(), meta, { xpIgnoredChannelIds: [GENERAL, GONE] });
    assert.deepEqual(codes(added.issues), ['xpIgnoredChannelIds.1:unknown_channel']);
  });

  it('ignored roles exist and are not @everyone (managed roles are allowed)', () => {
    const checked = checkGuildPatch(GUILD, defaultSettings(), meta, { xpIgnoredRoleIds: [PERRY, GUILD, GONE] });
    assert.deepEqual(codes(checked.issues), ['xpIgnoredRoleIds.1:role_everyone', 'xpIgnoredRoleIds.2:unknown_role']);
  });

  it('patches without ids need no guild data', () => {
    assert.equal(patchNeedsGuildData({ defaultVolume: 50, levelingEnabled: true, djRoleId: null }), false);
    assert.equal(patchNeedsGuildData({ xpIgnoredRoleIds: [] }), false);
    assert.equal(patchNeedsGuildData({ modLogChannelId: GENERAL }), true);
    assert.deepEqual(checkGuildPatch(GUILD, defaultSettings(), null, { defaultVolume: 50 }).value, { defaultVolume: 50 });
    assert.throws(() => checkGuildPatch(GUILD, defaultSettings(), null, { djRoleId: MEMBER }));
  });
});

describe('checkRewards', () => {
  it('reward roles must be assignable, not managed and not @everyone', () => {
    const checked = checkRewards(GUILD, [], meta, [
      { level: 5, roleId: MEMBER },
      { level: 10, roleId: ADMIN },
      { level: 15, roleId: PERRY },
      { level: 20, roleId: GUILD },
      { level: 25, roleId: GONE },
    ]);
    assert.deepEqual(codes(checked.issues), [
      'rewards.1.roleId:role_not_assignable',
      'rewards.2.roleId:role_managed',
      'rewards.3.roleId:role_everyone',
      'rewards.4.roleId:unknown_role',
    ]);
  });

  it('a stored reward whose role was deleted is dropped silently', () => {
    const checked = checkRewards(GUILD, [{ level: 3, roleId: GONE }], meta, [
      { level: 3, roleId: GONE },
      { level: 6, roleId: REGULAR },
    ]);
    assert.deepEqual(checked.issues, []);
    assert.deepEqual(checked.value, [{ level: 6, roleId: REGULAR }]);
  });
});

describe('checkAutomodBody', () => {
  const body = { enabled: true, alertChannelId: GENERAL, exemptRoleIds: [MEMBER], exemptChannelIds: [VOICE, CATEGORY] };

  it('exempt channels of any listed type pass; an added unknown exempt channel is unknown_channel', () => {
    assert.deepEqual(checkAutomodBody(GUILD, null, meta, body).issues, []);
    const unknown = checkAutomodBody(GUILD, null, meta, { ...body, exemptChannelIds: [GONE] });
    assert.deepEqual(codes(unknown.issues), ['exemptChannelIds.0:unknown_channel']);
  });

  it('a stale exempt channel already on the stored Perry rule is dropped silently', () => {
    const stored = { alertChannelId: null, exemptRoleIds: [], exemptChannelIds: [GONE] };
    const checked = checkAutomodBody(GUILD, stored, meta, { ...body, exemptChannelIds: [GONE, VOICE] });
    assert.deepEqual(checked.issues, []);
    assert.deepEqual(checked.value.exemptChannelIds, [VOICE]);
  });

  it('the alert channel is a text or announcement channel (the bot need not post there)', () => {
    assert.deepEqual(checkAutomodBody(GUILD, null, meta, { ...body, alertChannelId: READ_ONLY }).issues, []);
    assert.deepEqual(codes(checkAutomodBody(GUILD, null, meta, { ...body, alertChannelId: VOICE }).issues), [
      'alertChannelId:wrong_channel_type',
    ]);
    assert.deepEqual(codes(checkAutomodBody(GUILD, null, meta, { ...body, exemptRoleIds: [GUILD] }).issues), [
      'exemptRoleIds.0:role_everyone',
    ]);
  });
});
