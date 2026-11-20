/**
 * Forge's compatibility registry against forge's versions. What matters: the guard holds today, with nothing kept below the minimum and no
 * entry contradicting itself; raising the minimum to 1.0 makes exactly what forge keeps for clients built before system versions
 * removable and keeps every current endpoint; once that raise is made, the guard fails, naming each of those entries, until it is removed;
 * a client built for the current forge calls each endpoint 1.0 served at the version a 1.0 client calls it, as later minors only add;
 * presence and the crash log are dated 1.20, so a client built for 1.19 calls neither; the board document is dated 1.21, so a client built
 * for 1.20 is served no board endpoint and one built for 1.21 calls it at v1; the board event stream, a job's and a gate profile's stream
 * and the pictures are dated 1.22, so a client built for 1.21 calls none of them and one of the current forge calls each at v1; and every
 * entry is shipped, since forge serves each one.
 */
import { describe, expect, test } from 'bun:test';

import { CompatibilityRegistryUtil }                                  from 'system-versions/CompatibilityRegistryUtil';
import type { VersionsDocument }                                      from 'system-versions/VersionsDocument';
import { FORGE_COMPATIBILITY_REGISTRY, type ForgeCompatibilityEntry } from './ForgeCompatibilityRegistry.ts';
import { FORGE_SYSTEM_VERSIONS }                                      from './ForgeSystemVersions.ts';

const FIRST_VERSIONED_FORGE = { major: 1, minor: 0 };

const KEPT_FOR_CLIENTS_BEFORE_SYSTEM_VERSIONS = [
  'the unversioned routes, /api/<endpoint> beside each /api/v<n>/<endpoint>',
  'the integer version keys of the documents: identityVersion, contracts, summaryVersion, monitorVersion, controlVersion',
  'channelVersion 1 on every embed message, which a released Bridge and host compare for equality',
];

const CURRENT_ENDPOINTS = [
  'endpoint identity at v1',
  'endpoint summary at v1',
  'endpoint monitor at v2',
  'endpoint monitor/events at v2',
  'endpoint commands at v1',
  'endpoint session-codes at v1',
  'endpoint presence at v1',
  'endpoint crash-log at v1',
  'endpoint board at v1',
  'endpoint events at v1',
  'endpoint jobs/{jobId}/stream at v1',
  'endpoint profiles/{profileRunId}/stream at v1',
  'endpoint pictures at v1',
  'endpoint pictures/{pictureId} at v1',
];

const VERSIONED_STREAMS_AND_PICTURES = ['events', 'jobs/{jobId}/stream', 'profiles/{profileRunId}/stream', 'pictures', 'pictures/{pictureId}'];

const PRESENCE_FORGE = { major: 1, minor: 20 };
const BOARD_DOCUMENT_FORGE = { major: 1, minor: 21 };
const VERSIONED_STREAMS_FORGE = { major: 1, minor: 22 };

describe('forge\'s compatibility registry', () => {
  test('agrees with forge\'s versions: nothing is kept below the minimum supported, and no entry contradicts itself or another', () => {
    expect(CompatibilityRegistryUtil.inconsistenciesOf(FORGE_COMPATIBILITY_REGISTRY, FORGE_SYSTEM_VERSIONS)).toEqual([]);
  });

  test('a raise of the minimum to 1.0 makes exactly what forge keeps for clients before system versions removable, and keeps every current endpoint', () => {
    const report = CompatibilityRegistryUtil.raiseReportOf(FORGE_COMPATIBILITY_REGISTRY, FORGE_SYSTEM_VERSIONS, FIRST_VERSIONED_FORGE);
    expect(report.removable.map(CompatibilityRegistryUtil.labelOf)).toEqual(KEPT_FOR_CLIENTS_BEFORE_SYSTEM_VERSIONS);
    expect(report.kept.map(CompatibilityRegistryUtil.labelOf)).toEqual(CURRENT_ENDPOINTS);
  });

  test('once the minimum is raised to 1.0, the guard fails, naming each entry the raise made removable, until it is removed', () => {
    const raised: VersionsDocument = { ...FORGE_SYSTEM_VERSIONS, minimumSupported: FIRST_VERSIONED_FORGE };
    const removalSentence = ' is last needed by 0.0, below the minimum supported 1.0: remove it and what it keeps';
    expect(CompatibilityRegistryUtil.inconsistenciesOf(FORGE_COMPATIBILITY_REGISTRY, raised))
      .toEqual(KEPT_FOR_CLIENTS_BEFORE_SYSTEM_VERSIONS.map((label) => `${label}${removalSentence}`));
    const cleared = FORGE_COMPATIBILITY_REGISTRY.filter((entry) => entry.kind === 'endpoint');
    expect(CompatibilityRegistryUtil.inconsistenciesOf(cleared, raised)).toEqual([]);
  });

  test('a client built for the current forge calls each endpoint 1.0 served at the version a 1.0 client calls it, since later minors only add', () => {
    const endpoints = ['identity', 'summary', 'monitor', 'monitor/events', 'commands', 'session-codes'];
    expect(endpoints.map((endpoint) => CompatibilityRegistryUtil.endpointVersionAt(FORGE_COMPATIBILITY_REGISTRY, endpoint, FORGE_SYSTEM_VERSIONS.current)))
      .toEqual([1, 1, 2, 2, 1, 1]);
  });

  test('presence and the crash log are served at v1 from forge 1.20, and a client built for 1.19 calls neither', () => {
    const endpoints = ['presence', 'crash-log'];
    const versionsAt = (clientVersion: { major: number; minor: number }): (number | null)[] => endpoints
      .map((endpoint) => CompatibilityRegistryUtil.endpointVersionAt(FORGE_COMPATIBILITY_REGISTRY, endpoint, clientVersion));
    expect(versionsAt(PRESENCE_FORGE)).toEqual([1, 1]);
    expect(versionsAt(FORGE_SYSTEM_VERSIONS.current)).toEqual([1, 1]);
    expect(versionsAt({ major: 1, minor: 19 })).toEqual([null, null]);
  });

  test('the board document is served at v1 from forge 1.21, and a client built for 1.20 is served no board endpoint', () => {
    const boardVersionAt = (clientVersion: { major: number; minor: number }): number | null => CompatibilityRegistryUtil
      .endpointVersionAt(FORGE_COMPATIBILITY_REGISTRY, 'board', clientVersion);
    expect(boardVersionAt(BOARD_DOCUMENT_FORGE)).toBe(1);
    expect(boardVersionAt(FORGE_SYSTEM_VERSIONS.current)).toBe(1);
    expect(boardVersionAt(PRESENCE_FORGE)).toBeNull();
  });

  test('the board event stream, the job and profile streams and the pictures are served at v1 from forge 1.22, and none to a 1.21 client', () => {
    const versionsAt = (clientVersion: { major: number; minor: number }): (number | null)[] => VERSIONED_STREAMS_AND_PICTURES
      .map((endpoint) => CompatibilityRegistryUtil.endpointVersionAt(FORGE_COMPATIBILITY_REGISTRY, endpoint, clientVersion));
    expect(versionsAt(VERSIONED_STREAMS_FORGE)).toEqual([1, 1, 1, 1, 1]);
    expect(versionsAt(FORGE_SYSTEM_VERSIONS.current)).toEqual([1, 1, 1, 1, 1]);
    expect(versionsAt(BOARD_DOCUMENT_FORGE)).toEqual([null, null, null, null, null]);
    const entries = FORGE_COMPATIBILITY_REGISTRY.filter((entry) => entry.kind === 'endpoint' && VERSIONED_STREAMS_AND_PICTURES.includes(entry.endpoint));
    expect(entries.map((entry) => [entry.introducedIn, entry.lastNeededBy])).toEqual(VERSIONED_STREAMS_AND_PICTURES.map(() => [VERSIONED_STREAMS_FORGE, null]));
  });

  test('the board, presence and crash-log entries stay as forge 1.20 and 1.21 dated them', () => {
    const entryOf = (endpoint: string) => FORGE_COMPATIBILITY_REGISTRY.find((entry) => entry.kind === 'endpoint' && entry.endpoint === endpoint);
    const datedEntryOf = (endpoint: string, introducedIn: { major: number; minor: number }): ForgeCompatibilityEntry => ({
      kind: 'endpoint', endpoint, version: 1, introducedIn, lastNeededBy: null, source: 'shipped'
    });
    expect(['board', 'presence', 'crash-log'].map(entryOf)).toEqual([
      datedEntryOf('board', BOARD_DOCUMENT_FORGE),
      datedEntryOf('presence', PRESENCE_FORGE),
      datedEntryOf('crash-log', PRESENCE_FORGE),
    ]);
  });

  test('marks every endpoint and every compatibility path shipped, since every forge from 1.0 serves each versioned path beside its unversioned one', () => {
    expect(FORGE_COMPATIBILITY_REGISTRY.filter((entry) => entry.source !== 'shipped')).toEqual([]);
  });
});
