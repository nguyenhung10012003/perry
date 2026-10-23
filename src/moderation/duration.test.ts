import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDuration, parseDuration } from './duration.js';

describe('parseDuration', () => {
  // Acceptance 5.
  for (const [text, ms] of [
    ['10m', 600_000],
    ['1h30m', 5_400_000],
    ['28d', 2_419_200_000],
    ['1s', 1000],
    ['2w', 1_209_600_000],
    ['4w', 2_419_200_000],
    ['1h 30m', 5_400_000],
    [' 7D ', 604_800_000],
    ['0h30m', 1_800_000],
  ] as const) {
    it(`parses ${JSON.stringify(text)}`, () => {
      assert.deepEqual(parseDuration(text), { ok: true, ms });
    });
  }

  for (const text of ['0s', '10', 'abc', '', '   ', '1x', 'h', '-5m', '1.5h', 'm10']) {
    it(`rejects ${JSON.stringify(text)} as invalid`, () => {
      assert.deepEqual(parseDuration(text), { ok: false, reason: 'invalidDuration' });
    });
  }

  for (const text of ['29d', '28d1s', '5w', '99999999999999999999w']) {
    it(`rejects ${JSON.stringify(text)} as too long`, () => {
      assert.deepEqual(parseDuration(text), { ok: false, reason: 'durationTooLong' });
    });
  }
});

describe('formatDuration', () => {
  for (const [ms, text] of [
    [0, '0s'],
    [1000, '1s'],
    [90_000, '1m 30s'],
    [5_400_000, '1h 30m'],
    [95_400_000, '1d 2h 30m'],
    [2_419_200_000, '28d'],
  ] as const) {
    it(`formats ${ms}`, () => {
      assert.equal(formatDuration(ms), text);
    });
  }
});
