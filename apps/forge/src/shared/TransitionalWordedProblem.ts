import type { TransitionalWordedProblem } from './@types/StoredFileProblem.ts';

/** A reason a caller not yet converted words itself, as a problem; it goes once every format declares its problems. */
export function transitionalWordedProblemOf(sentence: string): TransitionalWordedProblem {
  return { code: 'transitional-worded', sentence };
}
