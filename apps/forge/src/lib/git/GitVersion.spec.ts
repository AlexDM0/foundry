/**
 * Reading `git version` against the floor. What matters: the floor is exactly 2.38, the first git with `merge-tree --write-tree`, so 2.38.0
 * passes and 2.37 refuses; vendor suffixes from Apple and Windows still read; and output that names no version is unreadable, never passed.
 */
import { describe, expect, test } from 'bun:test';

import { gitVersionVerdictOfOutput } from './GitVersion.ts';

describe('the git version against the 2.38 floor', () => {
  test.each([
    ['git version 2.38.0\n', '2.38.0'],
    ['git version 2.39.5 (Apple Git-154)\n', '2.39.5'],
    ['git version 2.45.1.windows.1\n', '2.45.1'],
    ['git version 3.0.0\n', '3.0.0'],
  ])('%p is supported', (printed, version) => {
    expect(gitVersionVerdictOfOutput(printed)).toEqual({ verdict: 'supported', version });
  });

  test.each([
    ['git version 2.37.1\n', '2.37.1'],
    ['git version 2.31.0\n', '2.31.0'],
    ['git version 1.99.9\n', '1.99.9'],
  ])('%p is below the floor', (printed, version) => {
    expect(gitVersionVerdictOfOutput(printed)).toEqual({ verdict: 'below-floor', version, floor: '2.38' });
  });

  test('output naming no version is unreadable', () => {
    expect(gitVersionVerdictOfOutput('installed\n')).toEqual({ verdict: 'unreadable', floor: '2.38' });
  });
});
