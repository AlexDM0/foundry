/**
 * The assembly of one `FleetSnapshot` from every forge's reading. What matters: the readings behind each artboard's fixture assemble to
 * exactly that fixture's model; the attention order of A1 holds whatever order the forges come in; a hidden forge is absent from everything
 * but the settings that hide it; agents and activity keep the orders `docs/design/screens.md` states; a forge's activity is cut at its newest 50; and
 * a forge whose snapshot still carries a `flintBrain` key adds no row for it, so no row has the role `brain`.
 */
import { describe, expect, test }    from 'bun:test';
import type { ForgeInterruptedWork } from 'forge-contracts/ForgePresenceDocument';

import { FLEET_OUTAGE_ENDINGS, OUTAGE_TALOS_PROTOCOL_VERSION }             from '../../../page/testing/fixtures/fleet-outage-endings.ts';
import type { ForgeIdentity }                                              from '../../adapters/forge-api/@types/ForgeDocumentReading.ts';
import { MonitorSnapshotIngestion }                                        from '../../adapters/forge-api/MonitorSnapshotIngestion.ts';
import { PresenceIngestion }                                               from '../../adapters/forge-api/PresenceIngestion.ts';
import { EXAMPLE_READ_STAMP, recordedDocumentOf, registryFactsOf }         from '../../adapters/forge-api/testing/ExampleForgeDocuments.ts';
import { recordedPresenceDocumentOf }                                      from '../../adapters/forge-api/testing/PresenceDocuments.ts';
import { FleetDocumentMapUtil }                                            from '../../adapters/page-api/FleetDocumentMapUtil.ts';
import { FLEET_SNAPSHOT_AT_LIMIT }                                         from '../../adapters/page-api/testing/fleet-snapshot-at-limit.ts';
import { FLEET_SNAPSHOT_DEGRADED }                                         from '../../adapters/page-api/testing/fleet-snapshot-degraded.ts';
import { FLEET_SNAPSHOT_EMPTY }                                            from '../../adapters/page-api/testing/fleet-snapshot-empty.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES, FLEET_SNAPSHOT_FIVE_FORGES_READINGS } from '../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import type { ActivityEntry }                                              from '../../shared/@types/ActivityEntry.ts';
import type { AgentRow }                                                   from '../../shared/@types/AgentRow.ts';
import type { FleetSnapshot }                                              from '../../shared/@types/FleetSnapshot.ts';
import type { ForgeReading }                                               from '../../shared/@types/ForgeReading.ts';
import { LIMITS }                                                          from '../../shared/constants/Limits.ts';
import { recordedForgeVersionsOf }                                         from '../../testing/BoundaryRecordings.ts';

import { fleetSnapshotOf, type FleetAssemblyInput } from './FleetAssembly.ts';

const READINGS = FLEET_SNAPSHOT_FIVE_FORGES_READINGS;

/** The readings, machine facts, settings and Gaia facts a fixture's model was drawn from. */
function inputBehind(snapshot: FleetSnapshot, readings: readonly ForgeReading[] = snapshot.forges): FleetAssemblyInput {
  return {
    readings,
    machine:  { cpuCount: snapshot.machine.cpuCount },
    settings: snapshot.settings,
    gaia:     snapshot.gaia,
  };
}

function snapshotHiding(trackerIds: string[], fixture: FleetSnapshot): FleetSnapshot {
  return fleetSnapshotOf({ ...inputBehind(fixture), settings: { ...fixture.settings, hiddenTrackerIds: trackerIds } });
}

function onlyAgentOf(reading: ForgeReading): AgentRow {
  const [row] = reading.agents;
  if (row === undefined || reading.agents.length !== 1) throw new Error(`${reading.project} does not run exactly one agent in the fixture.`);
  return row;
}

function landedEntryAt(logPosition: number, at: string): ActivityEntry {
  return {
    logPosition,
    at,
    category:   'landed',
    text:       `#${logPosition} landed on main`,
    boardRoute: null,
  };
}

describe('the artboards\' fixtures', () => {
  test('the readings of A1 assemble to the five-forges model', () => {
    expect(fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES))).toStrictEqual(FLEET_SNAPSHOT_FIVE_FORGES);
  });

  test('the readings of B3, B2 and B4 assemble to the degraded, at-limit and empty models', () => {
    expect(fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_DEGRADED))).toStrictEqual(FLEET_SNAPSHOT_DEGRADED);
    expect(fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_AT_LIMIT))).toStrictEqual(FLEET_SNAPSHOT_AT_LIMIT);
    expect(fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_EMPTY))).toStrictEqual(FLEET_SNAPSHOT_EMPTY);
  });
});

describe('attention', () => {
  test('holds the attention order of A1 whatever order the forges come in', () => {
    const reversed = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [...FLEET_SNAPSHOT_FIVE_FORGES.forges].reverse()));
    expect(reversed.attention.map((item) => item.idText)).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    expect(reversed.figures.waitingOnUser).toBe(5);
  });

  test('counts only the listed entries in waitingOnUser and names the counts-only forge as incomplete', () => {
    const degraded = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_DEGRADED));
    const countsOnly = degraded.forges.find((reading) => reading.fidelity === 'counts-only');
    expect([countsOnly?.trackerId, countsOnly?.attentionCount]).toEqual([READINGS.researchWiki.trackerId, 1]);
    expect(degraded.figures.waitingOnUser).toBe(degraded.attention.length);
    expect(degraded.figures.incompleteFor).toContain(READINGS.researchWiki.trackerId);
  });
});

describe('a hidden forge', () => {
  test('is absent from every part of the snapshot but the settings', () => {
    const hiddenTrackerId = READINGS.invoiceService.trackerId;
    const { settings, ...everythingButSettings } = snapshotHiding([hiddenTrackerId], FLEET_SNAPSHOT_FIVE_FORGES);
    expect(settings.hiddenTrackerIds).toEqual([hiddenTrackerId]);
    expect(JSON.stringify(everythingButSettings)).not.toContain(hiddenTrackerId);
  });

  test('adds nothing to a figure, a machine fact or the forges that cannot vouch', () => {
    const unreachable = READINGS.invoiceService.trackerId;
    const hidden      = snapshotHiding([unreachable], FLEET_SNAPSHOT_DEGRADED);
    expect(hidden.figures.waitingOnUser).toBe(2);
    expect(hidden.figures.agentsInFlight).toBe(7);
    expect(hidden.figures.tokensToday).toBe(658_000);
    expect(hidden.figures.incompleteFor).not.toContain(unreachable);
    expect(hidden.machine.agentsAskedForByForgeLimits).toBe(7);
    expect(hidden.needsALook.map((look) => look.kind)).not.toContain('unreachable');
  });
});

describe('agents', () => {
  test('are sorted by forge name, then by job id read as a number', () => {
    const storefront = { ...READINGS.exampleStorefront, project: 'Zebra Storefront' };
    const wikiWithLaterJob = { ...READINGS.researchWiki, agents: [{ ...onlyAgentOf(READINGS.researchWiki), jobId: 'J11' }, ...READINGS.researchWiki.agents] };
    const snapshot = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [storefront, wikiWithLaterJob, READINGS.invoiceService]));
    expect(snapshot.agents.map((row) => `${row.trackerId} ${row.jobId}`)).toEqual([
      `${READINGS.invoiceService.trackerId} J11`,
      `${READINGS.invoiceService.trackerId} J12`,
      `${READINGS.invoiceService.trackerId} J14`,
      `${READINGS.researchWiki.trackerId} J2`,
      `${READINGS.researchWiki.trackerId} J11`,
      `${READINGS.exampleStorefront.trackerId} J2`,
      `${READINGS.exampleStorefront.trackerId} J3`,
      `${READINGS.exampleStorefront.trackerId} J4`,
      `${READINGS.exampleStorefront.trackerId} J6`,
    ]);
  });

  test('list no job of a dormant forge or of one whose contract is newer', () => {
    const dormantWithJobs = { ...READINGS.designSystem, agents: READINGS.exampleStorefront.agents };
    const newerWithJobs   = { ...READINGS.invoiceService, fidelity: 'newer-contract' as const };
    expect(fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [dormantWithJobs, newerWithJobs])).agents).toEqual([]);
  });
});

const STOREFRONT = READINGS.exampleStorefront;

/** The identity of the forge the Storefront at work was recorded from: Example Storefront at monitor 5 and control 3. */
const RECORDED_FORGE_IDENTITY: ForgeIdentity = {
  trackerId: STOREFRONT.trackerId,
  project:   STOREFRONT.project,
  ...recordedForgeVersionsOf('hephaestus-fetch-supported-forge'),
  processId: 48_107,
  contracts: {
    summary: 3,
    monitor: 6,
    control: 3,
  },
};

describe('a forge whose snapshot still carries a `flintBrain` key', () => {
  test('adds no row of the role brain and no row beside its jobs, whatever the key holds', async () => {
    const facts = registryFactsOf(STOREFRONT);
    const recorded = await recordedDocumentOf('serving-every-contract', 'monitor', facts.hephaestusUrl) as Record<string, unknown>;
    const flintBrain = {
      state: 'running', startedAt: EXAMPLE_READ_STAMP, tokens: 11, calls: 1
    };
    const reading = new MonitorSnapshotIngestion(facts, RECORDED_FORGE_IDENTITY).readingOf({ ...recorded, flintBrain }, EXAMPLE_READ_STAMP);
    if (reading.verdict !== 'readable') throw new Error(`The snapshot does not read: ${reading.verdict}.`);
    const snapshot = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [reading.reading]));
    expect(snapshot.agents.map((row) => [row.jobId, row.role])).toEqual([['J1', 'product-owner']]);
  });

  test('no fixture\'s fleet holds a row of the role brain', () => {
    for (const fixture of [FLEET_SNAPSHOT_FIVE_FORGES, FLEET_SNAPSHOT_AT_LIMIT, FLEET_SNAPSHOT_DEGRADED, FLEET_SNAPSHOT_EMPTY]) {
      expect(fleetSnapshotOf(inputBehind(fixture)).agents.filter((row) => row.role === 'brain')).toEqual([]);
    }
  });
});

describe('activity', () => {
  test('interleaves every forge\'s entries by their stamps, newest first, a dormant forge\'s included', () => {
    const { activity } = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [READINGS.designSystem, READINGS.researchWiki]));
    expect(activity.map((entry) => [entry.trackerId, entry.logPosition])).toEqual([
      [READINGS.researchWiki.trackerId, 124],
      [READINGS.researchWiki.trackerId, 120],
      [READINGS.designSystem.trackerId, 88],
    ]);
  });

  test('keeps the newest 50 entries of each forge and drops the older ones', () => {
    const entryCount = LIMITS.activityEntriesShownPerForge + 2;
    const entries    = [...Array(entryCount).keys()].map((i) => landedEntryAt(i, `2026-11-12T10:${String(i).padStart(2, '0')}:00.000Z`));
    const busyForge  = { ...READINGS.exampleStorefront, activity: entries.toReversed() };
    const { activity } = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [busyForge, READINGS.designSystem]));
    const kept       = activity.filter((entry) => entry.trackerId === busyForge.trackerId);
    expect(LIMITS.activityEntriesShownPerForge).toBe(50);
    expect(kept).toHaveLength(LIMITS.activityEntriesShownPerForge);
    expect(kept.at(-1)?.logPosition).toBe(2);
    expect(activity.filter((entry) => entry.trackerId === READINGS.designSystem.trackerId)).toHaveLength(1);
  });

  test('puts an entry whose stamp does not parse after every entry whose stamp does', () => {
    const forge = { ...READINGS.exampleStorefront, activity: [landedEntryAt(1, 'not a stamp'), landedEntryAt(2, '2026-11-12T09:00:00.000Z')] };
    expect(fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [forge])).activity.map((entry) => entry.logPosition)).toEqual([2, 1]);
  });
});

describe('a forge that crashed', () => {
  test('leads what waits on User with its alert, which counts in waitingOnUser', () => {
    const [first, ...others] = FLEET_SNAPSHOT_FIVE_FORGES.forges;
    if (first === undefined) throw new Error('the five-forges snapshot holds no forge');
    const crashed = {
      ...first,
      fidelity:         'unreachable',
      condition:        'unreachable',
      registryPresence: {
        state: 'crashed', generation: 1, at: '2026-11-21T06:32:52+01:00', crash: null
      },
    } as const;
    const snapshot = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [crashed, ...others]));
    expect(snapshot.attention[0]).toMatchObject({ trackerId: first.trackerId, kind: 'forge-crashed', actionLabel: 'Start' });
    expect(snapshot.forges[0]?.presence.state).toBe('crashed');
    expect(snapshot.figures.waitingOnUser).toBe(snapshot.attention.length);
  });
});

/** A job of a presence document, typed against the forge's contract: the recordings hold no outage until the fake agent's is recorded. */
function interruptedWorkOf(jobId: string, ticketId: string, cause: ForgeInterruptedWork['cause'], waitsFor: ForgeInterruptedWork['waitsFor']): ForgeInterruptedWork {
  return {
    jobId, kind: 'build', ticketIds: [ticketId], cause, waitsFor, crashResumes: 0, automaticRestartsLeft: cause === 'network-outage' ? null : 2,
  };
}

/** The recorded presence of a serving forge, holding this interrupted work instead of none, and its Talos on the forge's own code. */
function presenceReportHolding(forge: ForgeReading, interruptedWork: readonly ForgeInterruptedWork[]): ForgeReading['presenceReport'] {
  const talos = { protocolVersion: OUTAGE_TALOS_PROTOCOL_VERSION, codeVersion: forge.codeVersion ?? '', startNumber: 1 };
  const reading = new PresenceIngestion().presenceReportOf({ ...recordedPresenceDocumentOf('presence-serving'), interruptedWork, talos });
  if (reading.report === null) throw new Error(`The presence document does not ingest: ${reading.reason.invalidKeys.join(', ')}`);
  return reading.report;
}

const OUTAGE_PRESENCE_REPORTS: Readonly<Record<string, ForgeReading['presenceReport']>> = {
  [READINGS.exampleStorefront.trackerId]: presenceReportHolding(READINGS.exampleStorefront, [
    interruptedWorkOf('J7', '021', 'network-outage', 'instruction'),
    interruptedWorkOf('J9', '024', 'network-outage', 'instruction'),
  ]),
  [READINGS.invoiceService.trackerId]:   presenceReportHolding(READINGS.invoiceService, [interruptedWorkOf('J3', '052', 'network-outage', 'instruction')]),
  [READINGS.exampleMobileApp.trackerId]: presenceReportHolding(READINGS.exampleMobileApp, [
    interruptedWorkOf('J5', '061', 'network-outage', 'nothing'),
    interruptedWorkOf('J6', '062', 'lease-ended', 'instruction'),
  ]),
};

function readingsAfterAnOutage(): ForgeReading[] {
  return FLEET_SNAPSHOT_FIVE_FORGES.forges.map((forge) => ({ ...forge, presenceReport: OUTAGE_PRESENCE_REPORTS[forge.trackerId] ?? forge.presenceReport }));
}

describe('agents a network outage stopped', () => {
  test('are counted per forge from its presence documents, summed for the fleet, and alerted once at the head of what waits', () => {
    const snapshot = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, readingsAfterAnOutage()));
    expect(snapshot.forges.map((forge) => [forge.project, forge.outageEndings])).toEqual([
      ['Example Storefront', 2],
      ['Invoice Service', 1],
      ['Research Wiki', 0],
      ['Example Mobile App', 0],
      ['Design System', 0],
      ['Legacy Importer', 0],
    ]);
    expect(snapshot.outageEndingsTotal).toBe(3);
    expect(snapshot.attention[0]).toMatchObject({ trackerId: null, kind: 'agents-ended-on-outage' });
    expect(snapshot.attention.slice(1)).toEqual(FLEET_SNAPSHOT_FIVE_FORGES.attention);
    expect(snapshot.figures.waitingOnUser).toBe(snapshot.attention.length);
  });

  test('reach the page as the outage fixture the Attention view is drawn from', () => {
    expect(FleetDocumentMapUtil.fleetDocumentOf(fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, readingsAfterAnOutage())))).toStrictEqual(FLEET_OUTAGE_ENDINGS);
  });

  test('count nothing in a forge not answering, whatever presence it last served, and raise no alert with none left', () => {
    const readings = readingsAfterAnOutage().map((reading) => ({ ...reading, fidelity: 'unreachable', condition: 'unreachable' } as const));
    const snapshot = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, readings));
    expect(snapshot.forges.every((forge) => forge.outageEndings === 0)).toBe(true);
    expect(snapshot.outageEndingsTotal).toBe(0);
    expect(snapshot.attention.some((item) => item.kind === 'agents-ended-on-outage')).toBe(false);
  });
});
