/**
 * Forge's compatibility registry against forge's versions. What matters: the guard holds today, with nothing kept below the minimum and no
 * entry contradicting itself; the registry holds endpoints only, every one shipped and still needed, since forge 2.0 keeps nothing for a
 * client of forge 1; a client built for 2.0 calls each endpoint at the listed version, the monitor, its stream, the commands, the board
 * and its event stream at the version 2.0 introduced; a client built for forge 1 is served none of those five; nothing is removable at
 * 2.0, nor at a raise of the minimum to the next minor; and the guard names an entry kept below the minimum, planted here, until it is
 * removed.
 */
import { describe, expect, test } from 'bun:test';

import { CompatibilityRegistryUtil }                                  from 'system-versions/CompatibilityRegistryUtil';
import type { SystemVersion, VersionsDocument }                       from 'system-versions/VersionsDocument';
import { FORGE_COMPATIBILITY_REGISTRY, type ForgeCompatibilityEntry } from './ForgeCompatibilityRegistry.ts';
import { FORGE_SYSTEM_VERSIONS }                                      from './ForgeSystemVersions.ts';

const HEADLESS_FORGE: SystemVersion = { major: 2, minor: 0 };
const NEXT_MINOR_FORGE: SystemVersion = { major: 2, minor: 1 };
const LAST_FORGE_BEFORE_HEADLESS: SystemVersion = { major: 1, minor: 23 };

const ENDPOINT_VERSIONS_OF_HEADLESS_FORGE: readonly (readonly [string, number])[] = [
  ['identity', 1],
  ['summary', 1],
  ['monitor', 3],
  ['monitor/events', 3],
  ['commands', 2],
  ['presence', 1],
  ['crash-log', 1],
  ['board', 2],
  ['events', 2],
  ['jobs/{jobId}/stream', 1],
  ['profiles/{profileRunId}/stream', 1],
  ['pictures', 1],
  ['pictures/{pictureId}', 1],
];

const ENDPOINTS_HEADLESS_FORGE_CHANGED = ['monitor', 'monitor/events', 'commands', 'board', 'events'];

const CURRENT_ENDPOINT_LABELS = ENDPOINT_VERSIONS_OF_HEADLESS_FORGE.map(([endpoint, version]) => `endpoint ${endpoint} at v${version}`);

function endpointVersionsAt(endpoints: readonly string[], clientVersion: SystemVersion): (number | null)[] {
  return endpoints.map((endpoint) => CompatibilityRegistryUtil.endpointVersionAt(FORGE_COMPATIBILITY_REGISTRY, endpoint, clientVersion));
}

describe('forge\'s compatibility registry', () => {
  test('agrees with forge\'s versions: nothing is kept below the minimum supported, and no entry contradicts itself or another', () => {
    expect(CompatibilityRegistryUtil.inconsistenciesOf(FORGE_COMPATIBILITY_REGISTRY, FORGE_SYSTEM_VERSIONS)).toEqual([]);
  });

  test('forge 2.0 supports no client of forge 1: the minimum supported is 2.0', () => {
    expect(FORGE_SYSTEM_VERSIONS).toEqual({ current: HEADLESS_FORGE, minimumSupported: HEADLESS_FORGE });
  });

  test('holds endpoints only, each shipped and still needed, with no compatibility path', () => {
    expect(FORGE_COMPATIBILITY_REGISTRY.map(CompatibilityRegistryUtil.labelOf)).toEqual(CURRENT_ENDPOINT_LABELS);
    const isKeptEndpoint = (entry: ForgeCompatibilityEntry): boolean => entry.kind === 'endpoint' && entry.source === 'shipped' && entry.lastNeededBy === null;
    expect(FORGE_COMPATIBILITY_REGISTRY.filter((entry) => !isKeptEndpoint(entry))).toEqual([]);
  });

  test('a client built for 2.0 calls each endpoint at the listed version', () => {
    const endpoints = ENDPOINT_VERSIONS_OF_HEADLESS_FORGE.map(([endpoint]) => endpoint);
    expect(endpointVersionsAt(endpoints, HEADLESS_FORGE)).toEqual(ENDPOINT_VERSIONS_OF_HEADLESS_FORGE.map(([, version]) => version));
    expect(endpointVersionsAt(endpoints, FORGE_SYSTEM_VERSIONS.current)).toEqual(ENDPOINT_VERSIONS_OF_HEADLESS_FORGE.map(([, version]) => version));
  });

  test('the monitor, its stream, the commands, the board and its event stream are dated 2.0, so a client built for forge 1 is served none of them', () => {
    const entries = FORGE_COMPATIBILITY_REGISTRY.filter((entry) => entry.kind === 'endpoint' && ENDPOINTS_HEADLESS_FORGE_CHANGED.includes(entry.endpoint));
    expect(entries.map((entry) => entry.introducedIn)).toEqual(ENDPOINTS_HEADLESS_FORGE_CHANGED.map(() => HEADLESS_FORGE));
    expect(endpointVersionsAt(ENDPOINTS_HEADLESS_FORGE_CHANGED, LAST_FORGE_BEFORE_HEADLESS)).toEqual(ENDPOINTS_HEADLESS_FORGE_CHANGED.map(() => null));
  });

  test('nothing is removable at 2.0, nor at a raise of the minimum to the next minor, which keeps every endpoint', () => {
    expect(CompatibilityRegistryUtil.removableAt(FORGE_COMPATIBILITY_REGISTRY, FORGE_SYSTEM_VERSIONS.minimumSupported)).toEqual([]);
    const afterNextMinor: VersionsDocument = { ...FORGE_SYSTEM_VERSIONS, current: NEXT_MINOR_FORGE };
    const report = CompatibilityRegistryUtil.raiseReportOf(FORGE_COMPATIBILITY_REGISTRY, afterNextMinor, NEXT_MINOR_FORGE);
    expect(report.removable).toEqual([]);
    expect(report.kept.map(CompatibilityRegistryUtil.labelOf)).toEqual(CURRENT_ENDPOINT_LABELS);
  });

  test('the guard names an entry kept for a client of forge 1, planted, until it is removed', () => {
    const keptForForgeOne: ForgeCompatibilityEntry = {
      kind:         'compatibility-path',
      name:         'an example path kept for a client of forge 1',
      introducedIn: { major: 1, minor: 0 },
      lastNeededBy: LAST_FORGE_BEFORE_HEADLESS,
      source:       'shipped',
    };
    expect(CompatibilityRegistryUtil.inconsistenciesOf([...FORGE_COMPATIBILITY_REGISTRY, keptForForgeOne], FORGE_SYSTEM_VERSIONS))
      .toEqual(['an example path kept for a client of forge 1 is last needed by 1.23, below the minimum supported 2.0: remove it and what it keeps']);
  });
});
