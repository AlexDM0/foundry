/**
 * The seeded sequence of the mind's state. What matters: each step is the linear congruential step of its constants, so a spec sees the
 * same walks and runs each time, and a seed reads as a fraction from 0 up to 1.
 */
import { expect, test } from 'bun:test';

import { SEEDED_SEQUENCE }    from '../../constants/Mind.ts';
import { SeededSequenceUtil } from './SeededSequenceUtil.ts';

test('the next seed is the linear congruential step, the same each time', () => {
  const next = SeededSequenceUtil.nextSeedOf(SEEDED_SEQUENCE.INITIAL_SEED);
  expect(next).toBe(((SEEDED_SEQUENCE.INITIAL_SEED * SEEDED_SEQUENCE.MULTIPLIER) + SEEDED_SEQUENCE.INCREMENT) % SEEDED_SEQUENCE.MODULUS);
  expect(SeededSequenceUtil.nextSeedOf(SEEDED_SEQUENCE.INITIAL_SEED)).toBe(next);
});

test('a seed reads as a fraction from 0 up to 1', () => {
  let seed: number = SEEDED_SEQUENCE.INITIAL_SEED;
  for (let i = 0; i < 100; i++) {
    seed = SeededSequenceUtil.nextSeedOf(seed);
    const fraction = SeededSequenceUtil.fractionOf(seed);
    expect(fraction).toBeGreaterThanOrEqual(0);
    expect(fraction).toBeLessThan(1);
  }
});
