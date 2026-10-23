import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  discordQuerySchema,
  generalPatchSchema,
  leaderboardQuerySchema,
  levelingPatchSchema,
  logoutBodySchema,
  moderationPatchSchema,
  publicLeaderboardQuerySchema,
  rewardsPutSchema,
  zodIssues,
} from './api.js';

const CHANNEL = '300000000000000001';
const ROLE = '400000000000000001';

describe('settings patch schemas', () => {
  it('general: accepts every field and rejects out-of-range values', () => {
    const valid = { language: 'vi', djRoleId: null, defaultVolume: 150, autoplayEnabled: true, autoplayMode: 'seed', twentyFourSeven: false };
    assert.equal(generalPatchSchema.safeParse(valid).success, true);
    assert.equal(generalPatchSchema.safeParse({ language: null }).success, true);
    const tooLoud = generalPatchSchema.safeParse({ defaultVolume: 999 });
    assert.equal(tooLoud.success, false);
    if (!tooLoud.success) assert.equal(zodIssues(tooLoud.error)[0]?.path, 'defaultVolume');
    assert.equal(generalPatchSchema.safeParse({ defaultVolume: 1.5 }).success, false);
    assert.equal(generalPatchSchema.safeParse({ language: 'fr' }).success, false);
    assert.equal(generalPatchSchema.safeParse({ djRoleId: '123' }).success, false);
  });

  it('every patch is strict and needs at least one key', () => {
    assert.equal(generalPatchSchema.safeParse({ x: 1 }).success, false);
    assert.equal(generalPatchSchema.safeParse({}).success, false);
    assert.equal(moderationPatchSchema.safeParse({}).success, false);
    assert.equal(levelingPatchSchema.safeParse({}).success, false);
    const poisoned: unknown = JSON.parse('{"__proto__":{"admin":true},"defaultVolume":50}');
    assert.equal(generalPatchSchema.safeParse(poisoned).success, false);
    assert.equal(moderationPatchSchema.safeParse({ modLogChannelId: CHANNEL, modDmTarget: false }).success, true);
  });

  it('leveling: multiplier 10..500, ignored lists of at most 50 unique ids', () => {
    assert.equal(levelingPatchSchema.safeParse({ xpMultiplierPercent: 10 }).success, true);
    assert.equal(levelingPatchSchema.safeParse({ xpMultiplierPercent: 501 }).success, false);
    assert.equal(levelingPatchSchema.safeParse({ levelUpMode: 'loud' }).success, false);
    const ids = Array.from({ length: 51 }, (_, i) => `3${String(i).padStart(17, '0')}`);
    assert.equal(levelingPatchSchema.safeParse({ xpIgnoredChannelIds: ids.slice(0, 50) }).success, true);
    assert.equal(levelingPatchSchema.safeParse({ xpIgnoredChannelIds: ids }).success, false);
    assert.equal(levelingPatchSchema.safeParse({ xpIgnoredRoleIds: [ROLE, ROLE] }).success, false);
  });
});

describe('rewards', () => {
  it('accepts 25 rewards with unique levels and roles', () => {
    const rewards = Array.from({ length: 25 }, (_, i) => ({ level: i + 1, roleId: `4${String(i).padStart(17, '0')}` }));
    assert.equal(rewardsPutSchema.safeParse({ rewards }).success, true);
    const more = [...rewards, { level: 26, roleId: '499999999999999999' }];
    assert.equal(rewardsPutSchema.safeParse({ rewards: more }).success, false);
  });

  it('reports duplicate levels and roles at their index', () => {
    const parsed = rewardsPutSchema.safeParse({
      rewards: [
        { level: 5, roleId: ROLE },
        { level: 5, roleId: '400000000000000002' },
        { level: 6, roleId: ROLE },
      ],
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.deepEqual(zodIssues(parsed.error).map((issue) => issue.path), ['rewards.1.level', 'rewards.2.roleId']);
    }
  });

  it('levels 1..1000 only', () => {
    assert.equal(rewardsPutSchema.safeParse({ rewards: [{ level: 0, roleId: ROLE }] }).success, false);
    assert.equal(rewardsPutSchema.safeParse({ rewards: [{ level: 1001, roleId: ROLE }] }).success, false);
  });
});

describe('queries and logout body', () => {
  it('pages are coerced and bounded', () => {
    assert.equal(leaderboardQuerySchema.parse({}).page, 1);
    assert.equal(leaderboardQuerySchema.parse({ page: '7' }).page, 7);
    assert.equal(leaderboardQuerySchema.safeParse({ page: '101' }).success, false);
    assert.equal(publicLeaderboardQuerySchema.safeParse({ page: '41' }).success, false);
    assert.equal(publicLeaderboardQuerySchema.safeParse({ page: 'x' }).success, false);
    assert.equal(discordQuerySchema.safeParse({ refresh: '1' }).success, true);
    assert.equal(discordQuerySchema.safeParse({ refresh: 'yes' }).success, false);
  });

  it('logout accepts only {}', () => {
    assert.equal(logoutBodySchema.safeParse({}).success, true);
    assert.equal(logoutBodySchema.safeParse({ x: 1 }).success, false);
  });
});
