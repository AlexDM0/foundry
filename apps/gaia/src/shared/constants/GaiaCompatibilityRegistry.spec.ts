/**
 * Gaia's compatibility registry against Gaia's own versions. What matters: the guard holds today, with nothing kept below the minimum and
 * no entry contradicting itself; a client built for the current Gaia calls each route at the version `GAIA_ENDPOINT_VERSIONS` serves it at;
 * the registry holds routes only, each still needed, since Gaia 4.0 keeps nothing for a page or a launcher of Gaia 3; the fleet and its
 * stream are dated 4.0, so a client of Gaia 3 is served neither; and the guard names an entry kept below the
 * minimum, planted here, until it is removed.
 */
import { describe, expect, test } from 'bun:test';

import type { CompatibilityEntry }   from 'system-versions/CompatibilityEntry';
import { CompatibilityRegistryUtil } from 'system-versions/CompatibilityRegistryUtil';
import type { VersionsDocument }     from 'system-versions/VersionsDocument';

import { GAIA_COMPATIBILITY_REGISTRY, GAIA_ENDPOINTS }                                 from './GaiaCompatibilityRegistry.ts';
import { GAIA_ENDPOINT_VERSIONS, GAIA_SYSTEM_VERSION, MINIMUM_SUPPORTED_GAIA_VERSION } from './GaiaSystemVersions.ts';

const GAIA_VERSIONS: VersionsDocument = { current: GAIA_SYSTEM_VERSION, minimumSupported: MINIMUM_SUPPORTED_GAIA_VERSION };
const LAST_GAIA_OF_MAJOR_THREE = { major: 3, minor: 0 };
const ROUTES_GAIA_FOUR_CHANGED = [GAIA_ENDPOINTS.fleet, GAIA_ENDPOINTS.events];

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

  test('Gaia 4.1 supports no client of Gaia 3: the minimum supported is 4.0', () => {
    expect(GAIA_VERSIONS).toEqual({ current: { major: 4, minor: 1 }, minimumSupported: { major: 4, minor: 0 } });
  });

  test('holds routes only, each still needed, with no compatibility path, so nothing is removable', () => {
    expect(GAIA_COMPATIBILITY_REGISTRY.filter((entry) => entry.kind !== 'endpoint' || entry.lastNeededBy !== null)).toEqual([]);
    expect(GAIA_COMPATIBILITY_REGISTRY).toHaveLength(Object.keys(GAIA_ENDPOINTS).length);
    expect(CompatibilityRegistryUtil.removableAt(GAIA_COMPATIBILITY_REGISTRY, MINIMUM_SUPPORTED_GAIA_VERSION)).toEqual([]);
  });

  test('the fleet and its stream are dated 4.0, so a client built for Gaia 3 is served neither', () => {
    const versionsAtMajorThree = ROUTES_GAIA_FOUR_CHANGED
      .map((endpoint) => CompatibilityRegistryUtil.endpointVersionAt(GAIA_COMPATIBILITY_REGISTRY, endpoint, LAST_GAIA_OF_MAJOR_THREE));
    expect(versionsAtMajorThree).toEqual([null, null]);
  });

  test('the guard names an entry kept for a client of Gaia 3, planted, until it is removed', () => {
    const keptForMajorThree: CompatibilityEntry = {
      kind:         'compatibility-path',
      name:         'an example path kept for a page of Gaia 3',
      introducedIn: { major: 1, minor: 0 },
      lastNeededBy: LAST_GAIA_OF_MAJOR_THREE,
    };
    expect(CompatibilityRegistryUtil.inconsistenciesOf([...GAIA_COMPATIBILITY_REGISTRY, keptForMajorThree], GAIA_VERSIONS))
      .toEqual(['an example path kept for a page of Gaia 3 is last needed by 3.0, below the minimum supported 4.0: remove it and what it keeps']);
  });
});
