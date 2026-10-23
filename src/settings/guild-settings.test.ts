import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_VOLUME, MAX_VOLUME } from '../config/constants.js';
import type { GuildSettings } from './guild-settings.js';
import { defaultSettings, validateSettingsPatch } from './guild-settings.js';

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
});
