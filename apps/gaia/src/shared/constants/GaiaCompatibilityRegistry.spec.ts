/**
 * Gaia's compatibility registry against Gaia's own versions. What matters: the guard holds today, with nothing kept below the minimum and
 * no entry contradicting itself; a client built for the current Gaia calls each route at the version `GAIA_ENDPOINT_VERSIONS` serves it at;
 * raising the minimum to 1.0 makes exactly the unversioned routes removable and keeps every route; and once that raise is made, the guard
 * fails, naming the unversioned routes, until they are removed.
 */
import { describe, expect, test } from 'bun:test';

import { CompatibilityRegistryUtil } from 'system-versions/CompatibilityRegistryUtil';
import type { VersionsDocument }     from 'system-versions/VersionsDocument';

import { GAIA_COMPATIBILITY_REGISTRY, GAIA_ENDPOINTS }                                 from './GaiaCompatibilityRegistry.ts';
import { GAIA_ENDPOINT_VERSIONS, GAIA_SYSTEM_VERSION, MINIMUM_SUPPORTED_GAIA_VERSION } from './GaiaSystemVersions.ts';

const GAIA_VERSIONS: VersionsDocument = { current: GAIA_SYSTEM_VERSION, minimumSupported: MINIMUM_SUPPORTED_GAIA_VERSION };
const FIRST_VERSIONED_GAIA = { major: 1, minor: 0 };
const UNVERSIONED_ROUTES = 'the unversioned routes, /api/<endpoint> beside each /api/v<n>/<endpoint>, for a page or a launcher from before system versions';

describe('Gaia\'s compatibility registry', () => {
  test('agrees with Gaia\'s versions: nothing is kept below the minimum supported, and no entry contradicts itself or another', () => {
    expect(CompatibilityRegistryUtil.inconsistenciesOf(GAIA_COMPATIBILITY_REGISTRY, GAIA_VERSIONS)).toEqual([]);
  });

  test('serves a client of the current Gaia each route at the version Gaia\'s server answers it at', () => {
    for (const [endpointName, endpoint] of Object.entries(GAIA_ENDPOINTS)) {
      const served = CompatibilityRegistryUtil.endpointVersionAt(GAIA_COMPATIBILITY_REGISTRY, endpoint, GAIA_SYSTEM_VERSION);
      expect([endpointName, served]).toEqual([endpointName, GAIA_ENDPOINT_VERSIONS[endpointName as keyof typeof GAIA_ENDPOINT_VERSIONS]]);
    }
  });

  test('a raise of the minimum to 1.0 makes exactly the unversioned routes removable, and keeps every route', () => {
    const report = CompatibilityRegistryUtil.raiseReportOf(GAIA_COMPATIBILITY_REGISTRY, GAIA_VERSIONS, FIRST_VERSIONED_GAIA);
    expect(report.removable.map(CompatibilityRegistryUtil.labelOf)).toEqual([UNVERSIONED_ROUTES]);
    expect(report.kept.every((entry) => entry.kind === 'endpoint')).toBe(true);
    expect(report.kept).toHaveLength(Object.keys(GAIA_ENDPOINTS).length);
  });

  test('once the minimum is raised to 1.0, the guard fails, naming the unversioned routes, until they are removed', () => {
    const raised: VersionsDocument = { ...GAIA_VERSIONS, minimumSupported: FIRST_VERSIONED_GAIA };
    expect(CompatibilityRegistryUtil.inconsistenciesOf(GAIA_COMPATIBILITY_REGISTRY, raised))
      .toEqual([`${UNVERSIONED_ROUTES} is last needed by 0.0, below the minimum supported 1.0: remove it and what it keeps`]);
    const cleared = GAIA_COMPATIBILITY_REGISTRY.filter((entry) => entry.kind === 'endpoint');
    expect(CompatibilityRegistryUtil.inconsistenciesOf(cleared, raised)).toEqual([]);
  });
});
