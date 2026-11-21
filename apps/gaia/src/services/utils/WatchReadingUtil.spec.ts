/**
 * The readings of a forge the watch cannot read now, held against the five-forge fixture: a forge stopped in this run keeps what it last
 * reported about its board, log and limits and loses what only a running Overseer knows, its brain included; an unreachable forge keeps its
 * whole last reading; a forge never read shows only what the registry says, and no fact stands in as zero. An Overseer is starting while
 * it refuses as starting or not ready, and for no other failure.
 */
import { describe, expect, test } from 'bun:test';

import type { RegisteredForge }                                from '../../adapters/forge-registry/@types/RegisteredForge.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES_READINGS, forgeReadingOf } from '../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import type { ForgeReading }                                   from '../../shared/@types/ForgeReading.ts';
import { WatchReadingUtil }                                    from './WatchReadingUtil.ts';

const READINGS = FLEET_SNAPSHOT_FIVE_FORGES_READINGS;

function entryOf(reading: ForgeReading, overseer: RegisteredForge['overseer']): RegisteredForge {
  return {
    trackerId:     reading.trackerId,
    project:       reading.project,
    root:          reading.root,
    program:       reading.program,
    overseer,
    lastCommand:   reading.lastCommand,
    lastChangedAt: reading.lastChangedAt,
    presence:      null,
  };
}

/** The entry the forge wrote at its stop, after the reading Gaia kept was taken. */
const STOP_FACTS = { lastCommand: 'oversee stop', lastChangedAt: '2026-11-12T12:40:00.000Z' } as const;

const EXAMPLE_OVERSEER = {
  url:       'http://127.0.0.1:4977/',
  processId: 51_230,
  startedAt: '2026-11-12T11:02:00.000Z',
  tokenPath: '/Users/alexexample/.forge-monitor/private/design-system-91c2/token',
} as const;

const LIVE_CONCURRENCY = {
  limit:                        2,
  agentsInFlight:               1,
  machineLimit:                 12,
  machineAgentsInFlight:        12,
  ticketsWaitingForMachineSlot: 0,
} as const;

/** The Design System forge as it was read in full just before its stop: what the fixture keeps, and what a running Overseer adds. */
const DESIGN_SYSTEM_BEFORE_THE_STOP: ForgeReading = {
  ...READINGS.designSystem,
  fidelity:          'full',
  condition:         'live',
  url:               'http://127.0.0.1:4977',
  processId:         EXAMPLE_OVERSEER.processId,
  overseerStartedAt: EXAMPLE_OVERSEER.startedAt,
  attention:         READINGS.exampleStorefront.attention,
  agents:            READINGS.exampleStorefront.agents,
  brain:             READINGS.exampleStorefront.brain,
  notices:           [{ kind: 'new-code', text: 'New code is on disk.' }],
  warnings:          [{ kind: 'baton-pass-failed', text: 'The Baton pass failed.' }],
  today:             { deliveredTickets: 2, tokens: 88_000 },
  usage:             {
    resetsAt:              '2026-11-12T17:00:00.000Z',
    window:                'five-hour',
    currentWindow:         'five_hour',
    currentWindowResetsAt: '2026-11-12T17:00:00.000Z',
  },
};

describe('a dormant forge', () => {
  test('keeps what it reported in this run about its board, log and limits, and loses its address, jobs, brain, what waits and today', () => {
    const dormant = WatchReadingUtil.dormantReadingOf(entryOf(READINGS.designSystem, null), DESIGN_SYSTEM_BEFORE_THE_STOP);
    expect(dormant).toEqual(READINGS.designSystem);
  });

  test('keeps its limits but loses the tickets that waited for a machine slot before its stop', () => {
    const stoppedWhileTicketsWaited = { ...DESIGN_SYSTEM_BEFORE_THE_STOP, concurrency: { ...LIVE_CONCURRENCY, ticketsWaitingForMachineSlot: 2 } };
    const dormant = WatchReadingUtil.dormantReadingOf(entryOf(READINGS.designSystem, null), stoppedWhileTicketsWaited);
    expect(dormant.concurrency).toEqual({ ...LIVE_CONCURRENCY, ticketsWaitingForMachineSlot: null });
  });

  test('names the last command its registry entry names now, not the one its kept reading was taken with', () => {
    const dormant = WatchReadingUtil.dormantReadingOf({ ...entryOf(READINGS.designSystem, null), ...STOP_FACTS }, DESIGN_SYSTEM_BEFORE_THE_STOP);
    expect(dormant).toMatchObject(STOP_FACTS);
  });

  test('shows only what the registry says when this run read nothing of it', () => {
    expect(WatchReadingUtil.dormantReadingOf(entryOf(READINGS.designSystem, null), null)).toMatchObject({
      fidelity:  'dormant',
      condition: 'dormant',
      url:       null,
      contracts: {
        summary: null, monitor: null, control: null, embed: null
      },
      lastReportedAt:   null,
      concurrency:      null,
      readyTicketCount: null,
      activity:         [],
      brain:            'not-reported',
      versions:         null,
    });
  });
});

describe('a forge whose repository is gone', () => {
  test('reads missing with nothing but its place in the registry', () => {
    const legacyEntry = entryOf(READINGS.legacyImporter, null);
    expect(WatchReadingUtil.repositoryMissingReadingOf(legacyEntry)).toEqual(forgeReadingOf(READINGS.legacyImporter));
  });
});

describe('a starting forge', () => {
  test('reads as dormant with the word starting and the address the registry names', () => {
    const starting = WatchReadingUtil.startingReadingOf(entryOf(READINGS.designSystem, EXAMPLE_OVERSEER), DESIGN_SYSTEM_BEFORE_THE_STOP);
    expect(starting).toEqual({
      ...READINGS.designSystem,
      condition:         'starting',
      url:               EXAMPLE_OVERSEER.url,
      processId:         EXAMPLE_OVERSEER.processId,
      overseerStartedAt: EXAMPLE_OVERSEER.startedAt,
    });
  });
});

describe('an Overseer that has not finished starting', () => {
  test('is told by its identity or monitor refusing as starting, and by its monitor stream refusing as not ready', () => {
    expect(WatchReadingUtil.failureMeansStarting({ verdict: 'refused', refusal: 'starting', text: null })).toBe(true);
    expect(WatchReadingUtil.failureMeansStarting({ verdict: 'refused', refusal: 'not-ready', text: null })).toBe(true);
  });

  test('is not told by another refusal, a refusal without a code, or any other failure', () => {
    expect(WatchReadingUtil.failureMeansStarting({ verdict: 'refused', refusal: 'read-failed', text: 'The Overseer could not read the board\'s files.' })).toBe(false);
    expect(WatchReadingUtil.failureMeansStarting({ verdict: 'refused', refusal: null, text: null })).toBe(false);
    expect(WatchReadingUtil.failureMeansStarting({ verdict: 'unauthorized' })).toBe(false);
    expect(WatchReadingUtil.failureMeansStarting({ verdict: 'unreachable' })).toBe(false);
    expect(WatchReadingUtil.failureMeansStarting({ verdict: 'malformed' })).toBe(false);
  });
});

describe('an unreachable forge', () => {
  test('keeps its whole last reading, stamped when the forge last reported it', () => {
    const invoiceEntry = entryOf(READINGS.invoiceService, { ...EXAMPLE_OVERSEER, url: 'http://127.0.0.1:4958/' });
    expect(WatchReadingUtil.unreachableReadingOf(invoiceEntry, READINGS.invoiceService))
      .toEqual({ ...READINGS.invoiceService, fidelity: 'unreachable', condition: 'unreachable' });
    const storefrontEntry = entryOf(READINGS.exampleStorefront, EXAMPLE_OVERSEER);
    expect(WatchReadingUtil.unreachableReadingOf(storefrontEntry, READINGS.exampleStorefront).brain).toEqual(READINGS.exampleStorefront.brain);
  });

  test('names the last command its registry entry names now, whether this run read it or not', () => {
    const invoiceEntry = { ...entryOf(READINGS.invoiceService, EXAMPLE_OVERSEER), ...STOP_FACTS };
    expect(WatchReadingUtil.unreachableReadingOf(invoiceEntry, READINGS.invoiceService)).toMatchObject(STOP_FACTS);
    expect(WatchReadingUtil.unreachableReadingOf(invoiceEntry, null)).toMatchObject(STOP_FACTS);
  });

  test('shows the address and process the registry names when this run never read it', () => {
    const unreachable = WatchReadingUtil.unreachableReadingOf(entryOf(READINGS.invoiceService, EXAMPLE_OVERSEER), null);
    expect(unreachable).toMatchObject({
      fidelity:          'unreachable',
      condition:         'unreachable',
      url:               EXAMPLE_OVERSEER.url,
      processId:         EXAMPLE_OVERSEER.processId,
      overseerStartedAt: EXAMPLE_OVERSEER.startedAt,
      lastReportedAt:    null,
      agents:            [],
      attention:         [],
    });
  });
});

describe('the registry facts', () => {
  test('carry the entry, its Overseer and the last command the entry names', () => {
    expect(WatchReadingUtil.registryFactsOf({ ...entryOf(READINGS.designSystem, EXAMPLE_OVERSEER), ...STOP_FACTS }, EXAMPLE_OVERSEER)).toEqual({
      trackerId:         READINGS.designSystem.trackerId,
      project:           READINGS.designSystem.project,
      root:              READINGS.designSystem.root,
      overseerUrl:       EXAMPLE_OVERSEER.url,
      overseerProcessId: EXAMPLE_OVERSEER.processId,
      program:           READINGS.designSystem.program,
      lastCommand:       STOP_FACTS.lastCommand,
      lastChangedAt:     STOP_FACTS.lastChangedAt,
    });
  });
});
