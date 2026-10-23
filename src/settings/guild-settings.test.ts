import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_VOLUME, MAX_VOLUME, XP_IGNORED_MAX } from '../config/constants.js';
import type { GuildSettings } from './guild-settings.js';
import { defaultSettings, referencePatch, validateSettingsPatch } from './guild-settings.js';

const CHANNEL = '123456789012345678';
const ROLE = '223456789012345678';
const OTHER = '323456789012345678';
const CHANNEL_2 = '423456789012345678';
const ROLE_2 = '523456789012345678';

/** n distinct 18-digit snowflakes. */
const snowflakes = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `6000000000000000${String(i).padStart(2, '0')}`);

describe('defaultSettings', () => {
  it('returns the documented defaults', () => {
    assert.deepEqual(defaultSettings(), {
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
    });
  });

  it('returns a fresh object on every call', () => {
    const first = defaultSettings();
    first.defaultVolume = 1;
    assert.equal(defaultSettings().defaultVolume, DEFAULT_VOLUME);
  });
});

describe('validateSettingsPatch', () => {
  const ok = (patch: Partial<GuildSettings>): void => assert.doesNotThrow(() => validateSettingsPatch(patch));
  const bad = (patch: Partial<GuildSettings>): void => assert.throws(() => validateSettingsPatch(patch), RangeError);

  it('accepts an empty patch', () => ok({}));

  it('checks the default volume bounds', () => {
    ok({ defaultVolume: 0 });
    ok({ defaultVolume: MAX_VOLUME });
    bad({ defaultVolume: -1 });
    bad({ defaultVolume: MAX_VOLUME + 1 });
    bad({ defaultVolume: 50.5 });
  });

  it('checks the autoplay mode', () => {
    ok({ autoplayMode: 'related' });
    ok({ autoplayMode: 'seed' });
    bad({ autoplayMode: 'other' as GuildSettings['autoplayMode'] });
  });

  it('checks the language', () => {
    ok({ language: null });
    ok({ language: 'en' });
    ok({ language: 'vi' });
    bad({ language: 'fr' as GuildSettings['language'] });
  });

  it('checks the mod-log channel', () => {
    ok({ modLogChannelId: null });
    ok({ modLogChannelId: '12345678901234567' });
    ok({ modLogChannelId: '12345678901234567890' });
    bad({ modLogChannelId: '1234567890123456' });
    bad({ modLogChannelId: '123456789012345678901' });
    bad({ modLogChannelId: '<#123456789012345678>' });
    bad({ modLogChannelId: '' });
  });

  it('checks the DM toggle', () => {
    ok({ modDmTarget: true });
    ok({ modDmTarget: false });
    bad({ modDmTarget: 'yes' as unknown as boolean });
  });

  it('checks the leveling and public leaderboard toggles', () => {
    ok({ levelingEnabled: true });
    ok({ levelingEnabled: false });
    ok({ leaderboardPublic: true });
    ok({ leaderboardPublic: false });
    bad({ levelingEnabled: 1 as unknown as boolean });
    bad({ leaderboardPublic: 'true' as unknown as boolean });
  });

  it('checks the XP multiplier bounds', () => {
    ok({ xpMultiplierPercent: 10 });
    ok({ xpMultiplierPercent: 100 });
    ok({ xpMultiplierPercent: 500 });
    bad({ xpMultiplierPercent: 9 });
    bad({ xpMultiplierPercent: 501 });
    bad({ xpMultiplierPercent: 150.5 });
    bad({ xpMultiplierPercent: Number.NaN });
  });

  it('checks the level-up mode and the reward mode', () => {
    for (const levelUpMode of ['off', 'current', 'channel', 'dm'] as const) ok({ levelUpMode });
    bad({ levelUpMode: 'thread' as GuildSettings['levelUpMode'] });
    ok({ levelRewardMode: 'stack' });
    ok({ levelRewardMode: 'highest' });
    bad({ levelRewardMode: 'all' as GuildSettings['levelRewardMode'] });
  });

  it('checks the level-up channel', () => {
    ok({ levelUpChannelId: null });
    ok({ levelUpChannelId: CHANNEL });
    bad({ levelUpChannelId: '1234567890123456' });
    bad({ levelUpChannelId: '<#123456789012345678>' });
    bad({ levelUpChannelId: 5 as unknown as string });
  });

  it('checks the ignored channel and role lists', () => {
    for (const key of ['xpIgnoredChannelIds', 'xpIgnoredRoleIds'] as const) {
      ok({ [key]: [] });
      ok({ [key]: [CHANNEL, ROLE] });
      ok({ [key]: snowflakes(XP_IGNORED_MAX) });
      bad({ [key]: snowflakes(XP_IGNORED_MAX + 1) });
      bad({ [key]: [CHANNEL, CHANNEL] });
      bad({ [key]: ['123'] });
      bad({ [key]: [CHANNEL, 7 as unknown as string] });
      bad({ [key]: CHANNEL as unknown as string[] });
    }
  });
});

describe('referencePatch', () => {
  const settings: GuildSettings = { ...defaultSettings(), modLogChannelId: CHANNEL, djRoleId: ROLE };

  it('clears the mod-log channel for a deleted channel', () => {
    assert.deepEqual(referencePatch(settings, { channelId: CHANNEL }), { modLogChannelId: null });
  });

  it('clears the DJ role for a deleted role', () => {
    assert.deepEqual(referencePatch(settings, { roleId: ROLE }), { djRoleId: null });
  });

  it('returns an empty patch for an unrelated id', () => {
    assert.deepEqual(referencePatch(settings, { channelId: OTHER }), {});
    assert.deepEqual(referencePatch(settings, { roleId: OTHER }), {});
    // A channel id never clears a role setting and vice versa.
    assert.deepEqual(referencePatch(settings, { channelId: ROLE }), {});
    assert.deepEqual(referencePatch(settings, { roleId: CHANNEL }), {});
  });

  it('leaves the unused default channels alone', () => {
    const withDefaults: GuildSettings = { ...defaultSettings(), defaultTextChannelId: CHANNEL };
    assert.deepEqual(referencePatch(withDefaults, { channelId: CHANNEL }), {});
  });

  const leveling: GuildSettings = {
    ...defaultSettings(),
    modLogChannelId: CHANNEL,
    levelUpChannelId: CHANNEL,
    xpIgnoredChannelIds: [CHANNEL_2, CHANNEL],
    djRoleId: ROLE,
    xpIgnoredRoleIds: [ROLE, ROLE_2],
  };

  it('clears the level-up channel and removes a deleted channel from the ignored channels', () => {
    assert.deepEqual(referencePatch(leveling, { channelId: CHANNEL }), {
      modLogChannelId: null,
      levelUpChannelId: null,
      xpIgnoredChannelIds: [CHANNEL_2],
    });
    assert.deepEqual(referencePatch(leveling, { channelId: CHANNEL_2 }), { xpIgnoredChannelIds: [CHANNEL] });
  });

  it('removes a deleted role from the ignored roles', () => {
    assert.deepEqual(referencePatch(leveling, { roleId: ROLE }), { djRoleId: null, xpIgnoredRoleIds: [ROLE_2] });
    assert.deepEqual(referencePatch(leveling, { roleId: ROLE_2 }), { xpIgnoredRoleIds: [ROLE] });
  });

  it('does not mutate the settings arrays', () => {
    referencePatch(leveling, { channelId: CHANNEL });
    referencePatch(leveling, { roleId: ROLE });
    assert.deepEqual(leveling.xpIgnoredChannelIds, [CHANNEL_2, CHANNEL]);
    assert.deepEqual(leveling.xpIgnoredRoleIds, [ROLE, ROLE_2]);
  });

  it('applied in sequence, removals of every listed id empty the lists', () => {
    let current: GuildSettings = { ...leveling };
    for (const ref of [{ channelId: CHANNEL }, { channelId: CHANNEL_2 }, { roleId: ROLE }, { roleId: ROLE_2 }]) {
      current = { ...current, ...referencePatch(current, ref) };
    }
    assert.deepEqual(current.xpIgnoredChannelIds, []);
    assert.deepEqual(current.xpIgnoredRoleIds, []);
    assert.equal(current.levelUpChannelId, null);
  });
});
