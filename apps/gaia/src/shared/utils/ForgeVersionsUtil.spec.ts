/**
 * The verdict on a forge's system version against the one forge version a Gaia supports: each of the four verdicts at its edges, a forge serving no
 * versions as older, and Gaia talking only to a current or an ahead forge.
 */
import { describe, expect, test } from 'bun:test';

import type { SystemVersion } from 'system-versions/VersionsDocument';

import { ForgeVersionsUtil } from './ForgeVersionsUtil.ts';

const EXAMPLE_SUPPORTED: SystemVersion = { major: 2, minor: 3 };

function verdictOf(current: readonly [number, number], minimumSupported: readonly [number, number]): string {
  const document = { current: { major: current[0], minor: current[1] }, minimumSupported: { major: minimumSupported[0], minor: minimumSupported[1] } };
  return ForgeVersionsUtil.forgeVersionsOf(document, EXAMPLE_SUPPORTED).verdict;
}

describe('the verdict', () => {
  test('is newer when the forge\'s minimum lies above the supported version, even by a minor', () => {
    expect([verdictOf([2, 5], [2, 4]), verdictOf([3, 0], [3, 0])]).toEqual(['newer', 'newer']);
  });

  test('is older when the forge lies below the supported version, even by a minor', () => {
    expect([verdictOf([2, 2], [1, 0]), verdictOf([1, 9], [1, 9]), verdictOf([0, 9], [0, 1])]).toEqual(['older', 'older', 'older']);
  });

  test('is ahead above the supported version while the forge still serves it, and current at it', () => {
    expect([verdictOf([2, 4], [2, 3]), verdictOf([3, 1], [1, 0])]).toEqual(['ahead', 'ahead']);
    expect(verdictOf([2, 3], [2, 0])).toBe('current');
  });

  test('carries both of the forge\'s versions', () => {
    const document = { current: { major: 2, minor: 4 }, minimumSupported: { major: 2, minor: 0 } };
    expect(ForgeVersionsUtil.forgeVersionsOf(document, EXAMPLE_SUPPORTED)).toEqual({ verdict: 'ahead', ...document });
  });

  test('of a forge that serves no versions is older, with neither of its versions', () => {
    expect(ForgeVersionsUtil.NO_VERSIONS_SERVED).toEqual({ verdict: 'older', current: null, minimumSupported: null });
  });
});

describe('what a verdict lets Gaia do', () => {
  test('talks to a forge that is current or ahead, and to no newer or older one', () => {
    const talksAt = (['newer', 'older', 'ahead', 'current'] as const)
      .filter((verdict) => ForgeVersionsUtil.canTalk({ verdict, current: null, minimumSupported: null }));
    expect(talksAt).toEqual(['ahead', 'current']);
  });
});
