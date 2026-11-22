/**
 * Forge's compatibility registry against forge's versions. What matters: the guard holds today, with nothing kept below the minimum and no
 * entry contradicting itself; the registry holds endpoints only, every one shipped and still needed, since forge 4.0 keeps nothing for a
 * client of forge 3; a client built for 4.0 calls each endpoint at the listed version, the summary, the monitor, its stream, the board and
 * its event stream at the version 4.0 introduced; a client built for forge 3 is served none of those five; nothing is removable at 4.0,
 * nor at a raise of the minimum to the next minor; and the guard names an entry kept below the minimum, planted here, until it is
 * removed.
 */
import { describe, expect, test } from 'bun:test';

import { CompatibilityRegistryUtil }                                  from 'system-versions/CompatibilityRegistryUtil';
import type { SystemVersion, VersionsDocument }                       from 'system-versions/VersionsDocument';
import { FORGE_COMPATIBILITY_REGISTRY, type ForgeCompatibilityEntry } from './ForgeCompatibilityRegistry.ts';
import { FORGE_SYSTEM_VERSIONS }                                      from './ForgeSystemVersions.ts';

const RESTARTING_FORGE: SystemVersion = { major: 4, minor: 0 };
const NEXT_MINOR_FORGE: SystemVersion = { major: 4, minor: 1 };
const LAST_FORGE_BEFORE_RESTARTING: SystemVersion = { major: 3, minor: 0 };

const ENDPOINT_VERSIONS_OF_RESTARTING_FORGE: readonly (readonly [string, number])[] = [
  ['identity', 1],
  ['summary', 3],
  ['monitor', 5],
  ['monitor/events', 5],
  ['commands', 3],
  ['presence', 1],
  ['crash-log', 1],
  ['board', 4],
  ['events', 4],
  ['jobs/{jobId}/stream', 1],
  ['profiles/{profileRunId}/stream', 1],
  ['pictures', 1],
  ['pictures/{pictureId}', 1],
];

const ENDPOINTS_RESTARTING_FORGE_CHANGED = ['summary', 'monitor', 'monitor/events', 'board', 'events'];

const CURRENT_ENDPOINT_LABELS = ENDPOINT_VERSIONS_OF_RESTARTING_FORGE.map(([endpoint, version]) => `endpoint ${endpoint} at v${version}`);

function endpointVersionsAt(endpoints: readonly string[], clientVersion: SystemVersion): (number | null)[] {
  return endpoints.map((endpoint) => CompatibilityRegistryUtil.endpointVersionAt(FORGE_COMPATIBILITY_REGISTRY, endpoint, clientVersion));
}

describe('forge\'s compatibility registry', () => {
  test('agrees with forge\'s versions: nothing is kept below the minimum supported, and no entry contradicts itself or another', () => {
    expect(CompatibilityRegistryUtil.inconsistenciesOf(FORGE_COMPATIBILITY_REGISTRY, FORGE_SYSTEM_VERSIONS)).toEqual([]);
  });

  test('forge 4.0 supports no client of forge 3: the minimum supported is 4.0', () => {
    expect(FORGE_SYSTEM_VERSIONS).toEqual({ current: RESTARTING_FORGE, minimumSupported: RESTARTING_FORGE });
  });

  test('holds endpoints only, each shipped and still needed, with no compatibility path', () => {
    expect(FORGE_COMPATIBILITY_REGISTRY.map(CompatibilityRegistryUtil.labelOf)).toEqual(CURRENT_ENDPOINT_LABELS);
    const isKeptEndpoint = (entry: ForgeCompatibilityEntry): boolean => entry.kind === 'endpoint' && entry.source === 'shipped' && entry.lastNeededBy === null;
    expect(FORGE_COMPATIBILITY_REGISTRY.filter((entry) => !isKeptEndpoint(entry))).toEqual([]);
  });

  test('a client built for 4.0 calls each endpoint at the listed version', () => {
    const endpoints = ENDPOINT_VERSIONS_OF_RESTARTING_FORGE.map(([endpoint]) => endpoint);
    expect(endpointVersionsAt(endpoints, RESTARTING_FORGE)).toEqual(ENDPOINT_VERSIONS_OF_RESTARTING_FORGE.map(([, version]) => version));
    expect(endpointVersionsAt(endpoints, FORGE_SYSTEM_VERSIONS.current)).toEqual(ENDPOINT_VERSIONS_OF_RESTARTING_FORGE.map(([, version]) => version));
  });

  test('the summary, the monitor, its stream, the board and its event stream are dated 4.0, so a client built for forge 3 is served none of them', () => {
    const entries = FORGE_COMPATIBILITY_REGISTRY.filter((entry) => entry.kind === 'endpoint' && ENDPOINTS_RESTARTING_FORGE_CHANGED.includes(entry.endpoint));
    expect(entries.map((entry) => entry.introducedIn)).toEqual(ENDPOINTS_RESTARTING_FORGE_CHANGED.map(() => RESTARTING_FORGE));
    expect(endpointVersionsAt(ENDPOINTS_RESTARTING_FORGE_CHANGED, LAST_FORGE_BEFORE_RESTARTING)).toEqual(ENDPOINTS_RESTARTING_FORGE_CHANGED.map(() => null));
  });

  test('nothing is removable at 4.0, nor at a raise of the minimum to the next minor, which keeps every endpoint', () => {
    expect(CompatibilityRegistryUtil.removableAt(FORGE_COMPATIBILITY_REGISTRY, FORGE_SYSTEM_VERSIONS.minimumSupported)).toEqual([]);
    const afterNextMinor: VersionsDocument = { ...FORGE_SYSTEM_VERSIONS, current: NEXT_MINOR_FORGE };
    const report = CompatibilityRegistryUtil.raiseReportOf(FORGE_COMPATIBILITY_REGISTRY, afterNextMinor, NEXT_MINOR_FORGE);
    expect(report.removable).toEqual([]);
    expect(report.kept.map(CompatibilityRegistryUtil.labelOf)).toEqual(CURRENT_ENDPOINT_LABELS);
  });

  test('the guard names an entry kept for a client of forge 3, planted, until it is removed', () => {
    const keptForForgeThree: ForgeCompatibilityEntry = {
      kind:         'compatibility-path',
      name:         'an example path kept for a client of forge 3',
      introducedIn: { major: 1, minor: 0 },
      lastNeededBy: LAST_FORGE_BEFORE_RESTARTING,
      source:       'shipped',
    };
    expect(CompatibilityRegistryUtil.inconsistenciesOf([...FORGE_COMPATIBILITY_REGISTRY, keptForForgeThree], FORGE_SYSTEM_VERSIONS))
      .toEqual(['an example path kept for a client of forge 3 is last needed by 3.0, below the minimum supported 4.0: remove it and what it keeps']);
  });
});
