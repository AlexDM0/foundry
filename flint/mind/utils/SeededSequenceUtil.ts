/** The seeded sequence of the mind's state: each step gives the next seed, and a seed reads as a fraction from 0 to 1. */
import { SEEDED_SEQUENCE } from '../../constants/Mind.ts';

export const SeededSequenceUtil = Object.freeze({
  nextSeedOf: (seed: number): number => ((seed * SEEDED_SEQUENCE.MULTIPLIER) + SEEDED_SEQUENCE.INCREMENT) % SEEDED_SEQUENCE.MODULUS,

  fractionOf: (seed: number): number => seed / SEEDED_SEQUENCE.MODULUS,
});
