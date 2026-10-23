import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_VOLUME, MAX_VOLUME } from '../config/constants.js';
import type { GuildSettings } from './guild-settings.js';
import { defaultSettings, referencePatch, validateSettingsPatch } from './guild-settings.js';

const CHANNEL = '123456789012345678';
const ROLE = '223456789012345678';
const OTHER = '323456789012345678';

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
});
