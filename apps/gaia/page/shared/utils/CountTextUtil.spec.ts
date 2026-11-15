/**
 * How a count prints, in every view alike. What matters: a phrase agrees with its count, one alone in the singular and none in the plural;
 * a short count keeps three significant digits, so a brain's `3.1k` and the fleet's `1.24M` read as the artboards write them; and the
 * rounding picks the unit, so a count just under a million reads `1M`, never `1000k`.
 */
import { describe, expect, test } from 'bun:test';

import { CountTextUtil } from './CountTextUtil.ts';

describe('a counted phrase', () => {
  test('takes the singular phrase for one and the plural for none and for many', () => {
    expect([0, 1, 2].map((count) => CountTextUtil.countedPhrase(count, 'agent runs', 'agents run'))).toEqual(['0 agents run', '1 agent runs', '2 agents run']);
  });
});

describe('a short count', () => {
  test('keeps three significant digits in its unit', () => {
    expect([840, 999, 3_100, 41_300, 51_900, 146_000, 1_240_000, 1_250_000, 12_345_678].map((count) => CountTextUtil.shortCountTextOf(count)))
      .toEqual(['840', '999', '3.1k', '41.3k', '51.9k', '146k', '1.24M', '1.25M', '12.3M']);
  });

  test('moves to the next unit when rounding reaches a thousand of the smaller one', () => {
    expect([999_499, 999_500, 999_940, 999_999].map((count) => CountTextUtil.shortCountTextOf(count))).toEqual(['999k', '1M', '1M', '1M']);
  });
});
