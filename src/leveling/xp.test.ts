import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { XP_TOTAL_MAX } from '../config/constants.js';
import { LEVEL_MAX, levelForXp, rollXp, totalXpForLevel, xpForNext, xpIntoLevel, xpToNext } from './xp.js';

describe('xpToNext', () => {
  it('follows 5l² + 50l + 100', () => {
    assert.equal(xpToNext(0), 100);
    assert.equal(xpToNext(1), 155);
    assert.equal(xpToNext(2), 220);
    assert.equal(xpToNext(10), 1100);
  });
});

describe('totalXpForLevel', () => {
  // Acceptance 12 and the table of design 4.7.1.
  for (const [level, total] of [
    [0, 0],
    [1, 100],
    [2, 255],
    [3, 475],
    [5, 1150],
    [10, 4675],
    [20, 23_850],
    [30, 67_525],
    [50, 268_375],
    [100, 1_899_250],
  ] as const) {
    it(`level ${level} needs ${total} XP`, () => {
      assert.equal(totalXpForLevel(level), total);
    });
  }

  it('equals the sum of xpToNext for every level 0..1100', () => {
    let sum = 0;
    for (let level = 0; level <= 1100; level += 1) {
      assert.equal(totalXpForLevel(level), sum, `level ${level}`);
      assert.ok(Number.isInteger(totalXpForLevel(level)));
      sum += xpToNext(level);
    }
  });
});

describe('levelForXp', () => {
  // Acceptance 12.
  for (const [xp, level] of [
    [0, 0],
    [99, 0],
    [100, 1],
    [254, 1],
    [255, 2],
    [4674, 9],
    [4675, 10],
    [XP_TOTAL_MAX, 1058],
  ] as const) {
    it(`${xp} XP is level ${level}`, () => {
      assert.equal(levelForXp(xp), level);
    });
  }

  it('is the largest level whose total does not exceed the XP, at every level boundary', () => {
    for (let level = 1; level <= 1100; level += 1) {
      const total = totalXpForLevel(level);
      assert.equal(levelForXp(total), level);
      assert.equal(levelForXp(total - 1), level - 1);
    }
  });

  it('stays within 0..LEVEL_MAX', () => {
    assert.equal(levelForXp(-1), 0);
    assert.equal(levelForXp(Number.MAX_SAFE_INTEGER), LEVEL_MAX);
  });
});

describe('progress helpers', () => {
  it('splits the XP into the current level', () => {
    assert.equal(xpIntoLevel(300, 2), 45);
    assert.equal(xpForNext(2), 220);
    assert.equal(xpIntoLevel(255, 2), 0);
  });
});

describe('rollXp', () => {
  // Acceptance 13: the random extremes (0 and 0.9999) at 10, 100, 200 and 500 %.
  for (const [percent, low, high] of [
    [10, 2, 3],
    [100, 15, 25],
    [200, 30, 50],
    [500, 75, 125],
  ] as const) {
    it(`gives ${low} and ${high} at ${percent} %`, () => {
      assert.equal(rollXp(percent, () => 0), low);
      assert.equal(rollXp(percent, () => 0.9999), high);
    });
  }

  it('gives an integer of at least 1 in range for every random value', () => {
    for (const percent of [10, 100, 200, 500]) {
      for (let i = 0; i < 1000; i += 1) {
        const xp = rollXp(percent, () => i / 1000);
        assert.ok(Number.isInteger(xp) && xp >= 1, `${percent} % at ${i / 1000}: ${xp}`);
        assert.ok(xp >= Math.max(1, Math.round((15 * percent) / 100)) && xp <= Math.round((25 * percent) / 100));
      }
    }
  });

  it('uses Math.random by default', () => {
    const xp = rollXp(100);
    assert.ok(xp >= 15 && xp <= 25);
  });
});
