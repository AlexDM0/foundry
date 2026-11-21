/**
 * The assembly of one `FleetSnapshot` from every forge's reading. What matters: the readings behind each artboard's fixture assemble to
 * exactly that fixture's model; the attention order of A1 holds whatever order the forges come in; a hidden forge is absent from everything
 * but the settings that hide it; agents and activity keep the orders PLAN 7.4 states; a forge's activity is cut at its newest 50; and
 * Flint's brain (PLAN 7.5), read from the recorded answers of the forge Gaia supports: running, it adds one agent row of role `brain` that
 * counts in no figure or limit; ended, it leaves one activity entry with its tokens.
 */
import { describe, expect, test }    from 'bun:test';
import type { ForgeInterruptedWork } from 'forge-contracts/ForgePresenceDocument';

import { FLEET_OUTAGE_ENDINGS, OUTAGE_TALOS_PROTOCOL_VERSION }               from '../../../page/testing/fixtures/fleet-outage-endings.ts';
import type { ForgeIdentity }                                                from '../../adapters/forge-api/@types/ForgeDocumentReading.ts';
import { MonitorSnapshotIngestion }                                          from '../../adapters/forge-api/MonitorSnapshotIngestion.ts';
import { PresenceIngestion }                                                 from '../../adapters/forge-api/PresenceIngestion.ts';
import { EXAMPLE_READ_STAMP, recordedFlintBrainDocumentOf, registryFactsOf } from '../../adapters/forge-api/testing/ExampleForgeDocuments.ts';
import { recordedPresenceDocumentOf }                                        from '../../adapters/forge-api/testing/PresenceDocuments.ts';
import { FleetDocumentMapUtil }                                              from '../../adapters/page-api/FleetDocumentMapUtil.ts';
import { FLEET_SNAPSHOT_AT_LIMIT }                                           from '../../adapters/page-api/testing/fleet-snapshot-at-limit.ts';
import { FLEET_SNAPSHOT_DEGRADED }                                           from '../../adapters/page-api/testing/fleet-snapshot-degraded.ts';
import { FLEET_SNAPSHOT_EMPTY }                                              from '../../adapters/page-api/testing/fleet-snapshot-empty.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES, FLEET_SNAPSHOT_FIVE_FORGES_READINGS }   from '../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import type { ActivityEntry }                                                from '../../shared/@types/ActivityEntry.ts';
import type { AgentRow }                                                     from '../../shared/@types/AgentRow.ts';
import type { FleetSnapshot }                                                from '../../shared/@types/FleetSnapshot.ts';
import type { ForgeBrain }                                                   from '../../shared/@types/ForgeBrain.ts';
import type { ForgeReading }                                                 from '../../shared/@types/ForgeReading.ts';
import { LIMITS }                                                            from '../../shared/constants/Limits.ts';
import type { FlintBrainSituation }                                          from '../../testing/RecordedAnswers.ts';

import {
  FLINT_BRAIN_ROLE,
  FLINT_BRAIN_ROW_ID,
  fleetSnapshotOf,
  type FleetAssemblyInput,
} from './FleetAssembly.ts';

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
    kind:       null,
    tokens:     null,
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
  test('are sorted by forge name, then by job id read as a number, a running brain\'s row closing its forge\'s rows', () => {
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
      `${READINGS.exampleStorefront.trackerId} ${FLINT_BRAIN_ROW_ID}`,
    ]);
  });

  test('list no job of a dormant forge or of one whose contract is newer', () => {
    const dormantWithJobs = { ...READINGS.designSystem, agents: READINGS.exampleStorefront.agents };
    const newerWithJobs   = { ...READINGS.invoiceService, fidelity: 'newer-contract' as const };
    expect(fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [dormantWithJobs, newerWithJobs])).agents).toEqual([]);
  });
});

const STOREFRONT = READINGS.exampleStorefront;

/** The identity of the forge the brain's answers were recorded from: Example Storefront at monitor 3 and control 1. */
const BRAIN_FORGE_IDENTITY: ForgeIdentity = {
  trackerId:      STOREFRONT.trackerId,
  project:        STOREFRONT.project,
  codeVersion:    'fbc3c0ad0259',
  installVersion: 42,
  processId:      48_107,
  contracts:      {
    summary: 1,
    monitor: 3,
    control: 1,
  },
};

/** Example Storefront as the recorded snapshot of one state of its brain reads, through the ingestion. */
async function recordedBrainReadingOf(situation: FlintBrainSituation): Promise<ForgeReading> {
  const facts = registryFactsOf(STOREFRONT);
  const snapshot = await recordedFlintBrainDocumentOf(situation, 'monitor', facts.overseerUrl);
  const reading = new MonitorSnapshotIngestion(facts, BRAIN_FORGE_IDENTITY).readingOf(snapshot, EXAMPLE_READ_STAMP);
  if (reading.verdict !== 'readable') throw new Error(`The ${situation} snapshot does not read: ${reading.verdict}.`);
  return reading.reading;
}

function brainIn(state: ForgeBrain['state']): ForgeBrain {
  const { brain } = STOREFRONT;
  if (brain === 'not-reported') throw new Error('The five-forges fixture shows no brain on Example Storefront.');
  return { ...brain, state };
}

describe('Flint\'s brain', () => {
  test('a running brain adds one agent row of role brain, after its forge\'s jobs, that counts against no limit', async () => {
    const snapshot = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [await recordedBrainReadingOf('brain-running')]));
    expect(snapshot.agents.map((row) => [row.jobId, row.role, row.countsAgainstLimit])).toEqual([
      ['J1', 'assistant', true],
      [FLINT_BRAIN_ROW_ID, FLINT_BRAIN_ROLE, false],
    ]);
    expect(snapshot.agents.at(-1)).toMatchObject({
      trackerId:  STOREFRONT.trackerId,
      state:      'running',
      tokens:     11,
      calls:      1,
      startedAt:  '2026-11-21T07:05:52.612Z',
      ticketIds:  [],
      boardRoute: null,
    });
  });

  test('a running brain counts in no figure, no machine fact and no forge\'s jobs, and is no attention item', () => {
    const withoutBrain = { ...STOREFRONT, brain: 'not-reported' as const };
    const running = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES));
    const notReported = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [withoutBrain, ...FLEET_SNAPSHOT_FIVE_FORGES.forges.slice(1)]));
    expect(running.agents).toHaveLength(notReported.agents.length + 1);
    const countedPartsOf = (snapshot: FleetSnapshot) => [snapshot.figures, snapshot.machine, snapshot.attention, snapshot.needsALook];
    expect(countedPartsOf(running)).toEqual(countedPartsOf(notReported));
    expect(running.forges[0]?.agents).toEqual(STOREFRONT.agents);
    expect([running.figures.agentsInFlight, running.figures.machineLimit]).toEqual([10, 12]);
  });

  test('a brain that is off, starting, ended or refused, or that is not reported, adds no row', () => {
    for (const brain of [...(['off', 'starting', 'ended', 'refused'] as const).map(brainIn), 'not-reported' as const]) {
      const snapshot = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [{ ...STOREFRONT, brain }]));
      const brainName = brain === 'not-reported' ? brain : brain.state;
      expect([brainName, snapshot.agents.map((row) => row.jobId)]).toEqual([brainName, ['J2', 'J3', 'J4', 'J6']]);
    }
  });

  test('a running brain of a dormant forge or of one whose contract is newer adds no row; one of an unreachable forge stays as last reported', () => {
    const dormant = { ...STOREFRONT, fidelity: 'dormant' as const };
    const newer   = { ...STOREFRONT, fidelity: 'newer-contract' as const };
    expect(fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [dormant, newer])).agents).toEqual([]);
    const unreachable = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [{ ...STOREFRONT, fidelity: 'unreachable' as const }]));
    expect(unreachable.agents.at(-1)?.jobId).toBe(FLINT_BRAIN_ROW_ID);
  });

  test('an ended brain adds one activity entry, the forge\'s own words with its tokens, and no row', async () => {
    const snapshot = fleetSnapshotOf(inputBehind(FLEET_SNAPSHOT_FIVE_FORGES, [await recordedBrainReadingOf('brain-ended')]));
    expect(snapshot.activity.filter((entry) => entry.kind === 'flint-brain')).toEqual([{
      trackerId:   STOREFRONT.trackerId,
      logPosition: 6,
      at:          '2026-11-21T08:05:53+01:00',
      category:    'agent',
      text:        'Flint\'s brain was stopped, after 1 model call and 11 tokens',
      boardRoute:  null,
      kind:        'flint-brain',
      tokens:      11,
    }]);
    expect(snapshot.agents.map((row) => row.jobId)).toEqual(['J1']);
    expect(snapshot.figures.tokensToday).toBe(11);
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
