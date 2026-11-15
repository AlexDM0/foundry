/**
 * The verdict on a forge's system version against the two forge versions a Gaia knows, against its own contract. What matters: each of
 * the six verdicts at its edges (a forge minimum just above the version Gaia is built for is newer; a forge just below Gaia's minimum is
 * older; above, below and equal to the version Gaia is built for are ahead, behind and current; no document is not reported), that a
 * forge Gaia cannot talk to is never ahead or behind, and the paths each verdict calls.
 */
import { describe, expect, test } from 'bun:test';

import { ForgeVersionsUtil, type KnownForgeVersions } from './ForgeVersionsUtil.ts';

const EXAMPLE_GAIA: KnownForgeVersions = { supported: { major: 2, minor: 3 }, minimum: { major: 1, minor: 4 } };

function verdictOf(current: readonly [number, number], minimumSupported: readonly [number, number]): string {
  const document = { current: { major: current[0], minor: current[1] }, minimumSupported: { major: minimumSupported[0], minor: minimumSupported[1] } };
  return ForgeVersionsUtil.forgeVersionsOf(document, EXAMPLE_GAIA).verdict;
}

describe('the verdict', () => {
  test('is newer when the forge\'s minimum lies above the version Gaia is built for, even by a minor', () => {
    expect([verdictOf([2, 5], [2, 4]), verdictOf([3, 0], [3, 0])]).toEqual(['newer', 'newer']);
  });

  test('is older when the forge lies below the oldest version Gaia talks to, even by a minor', () => {
    expect([verdictOf([1, 3], [1, 0]), verdictOf([0, 9], [0, 1])]).toEqual(['older', 'older']);
  });

  test('is ahead above the version Gaia is built for while the forge still serves it, behind below it down to Gaia\'s minimum, and current at it', () => {
    expect([verdictOf([2, 4], [2, 3]), verdictOf([3, 1], [1, 0])]).toEqual(['ahead', 'ahead']);
    expect([verdictOf([2, 2], [1, 0]), verdictOf([1, 4], [1, 4])]).toEqual(['behind', 'behind']);
    expect(verdictOf([2, 3], [2, 0])).toBe('current');
  });

  test('is not reported for a forge that publishes no versions, with neither of its versions', () => {
    expect(ForgeVersionsUtil.forgeVersionsOf(null, EXAMPLE_GAIA)).toEqual({ verdict: 'not-reported', current: null, minimumSupported: null });
  });

  test('carries both of the forge\'s versions', () => {
    const document = { current: { major: 2, minor: 4 }, minimumSupported: { major: 2, minor: 0 } };
    expect(ForgeVersionsUtil.forgeVersionsOf(document, EXAMPLE_GAIA)).toEqual({ verdict: 'ahead', ...document });
  });
});

describe('what a verdict lets Gaia do', () => {
  test('talks to a forge at every verdict but newer and older', () => {
    const talksAt = (['newer', 'older', 'ahead', 'behind', 'current', 'not-reported'] as const)
      .filter((verdict) => ForgeVersionsUtil.canTalk({ verdict, current: null, minimumSupported: null }));
    expect(talksAt).toEqual(['ahead', 'behind', 'current', 'not-reported']);
  });

  test('calls the versioned paths of a forge that publishes its versions, and today\'s paths of one that publishes none', () => {
    expect(ForgeVersionsUtil.overseerPathsOf({ verdict: 'current', current: { major: 1, minor: 0 }, minimumSupported: { major: 1, minor: 0 } })).toBe('versioned');
    expect(ForgeVersionsUtil.overseerPathsOf(ForgeVersionsUtil.NOT_REPORTED)).toBe('unversioned');
  });
});
