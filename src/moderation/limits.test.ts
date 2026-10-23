import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CASE_NUMBER_MAX, clampPage, parseCaseNumber } from './limits.js';

describe('parseCaseNumber', () => {
  // Acceptance 4a.
  it('accepts 1 and 2147483647', () => {
    assert.equal(parseCaseNumber(1), 1);
    assert.equal(parseCaseNumber(2_147_483_647), 2_147_483_647);
    assert.equal(CASE_NUMBER_MAX, 2_147_483_647);
  });

  for (const value of [0, -1, 2_147_483_648, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    it(`rejects ${value}`, () => {
      assert.equal(parseCaseNumber(value), null);
    });
  }
});

describe('clampPage', () => {
  for (const [requested, totalPages, expected] of [
    [1, 5, 1],
    [3, 5, 3],
    [5, 5, 5],
    [6, 5, 5],
    [10_000, 3, 3],
    [0, 5, 1],
    [-2, 5, 1],
    [2.7, 5, 2],
    [Number.NaN, 5, 1],
    [1, 0, 1],
    [4, 0, 1],
  ] as const) {
    it(`clampPage(${requested}, ${totalPages}) = ${expected}`, () => {
      assert.equal(clampPage(requested, totalPages), expected);
    });
  }
});
