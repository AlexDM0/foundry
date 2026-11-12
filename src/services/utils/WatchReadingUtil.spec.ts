/**
 * The readings of a forge the watch cannot read now, held against the five-forge fixture: a forge stopped in this run keeps what it last
 * reported about its board, log and limits and loses what only a running Overseer knows; an unreachable forge keeps its whole last reading;
 * a forge never read shows only what the registry says, and no fact stands in as zero.
 */
import { describe, expect, test } from 'bun:test';

import type { RegisteredForge }                from '../../adapters/forge-registry/@types/RegisteredForge.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES_READINGS } from '../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import type { ForgeReading }                   from '../../shared/@types/ForgeReading.ts';
import { WatchReadingUtil }                    from './WatchReadingUtil.ts';

const READINGS = FLEET_SNAPSHOT_FIVE_FORGES_READINGS;

function entryOf(reading: ForgeReading, overseer: RegisteredForge['overseer']): RegisteredForge {
  return {
    trackerId: reading.trackerId,
    project:   reading.project,
    root:      reading.root,
    program:   null,
    overseer,
  };
}

const EXAMPLE_OVERSEER = {
  url:       'http://127.0.0.1:4977/',
  processId: 51_230,
  startedAt: '2026-11-12T11:02:00.000Z',
  tokenPath: '/Users/alexexample/.forge-monitor/watchers/design-system-91c2/token',
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
  notices:           [{ kind: 'new-code', text: 'New code is on disk.' }],
  warnings:          [{ kind: 'baton-pass-failed', text: 'The Baton pass failed.' }],
  today:             { deliveredTickets: 2, tokens: 88_000 },
  usage:             { resetsAt: '2026-11-12T17:00:00.000Z', window: 'five-hour' },
};

describe('a dormant forge', () => {
  test('keeps what it reported in this run about its board, log and limits, and loses its address, jobs, what waits and today', () => {
    const dormant = WatchReadingUtil.dormantReadingOf(entryOf(READINGS.designSystem, null), DESIGN_SYSTEM_BEFORE_THE_STOP);
    expect(dormant).toEqual(READINGS.designSystem);
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
    });
  });
});

describe('a forge whose repository is gone', () => {
  test('reads missing with nothing but its place in the registry', () => {
    const legacyEntry = entryOf(READINGS.legacyImporter, null);
    expect(WatchReadingUtil.repositoryMissingReadingOf(legacyEntry)).toEqual({ ...READINGS.legacyImporter, lastCommand: null, lastChangedAt: null });
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

describe('an unreachable forge', () => {
  test('keeps its whole last reading, stamped when the forge last reported it', () => {
    const invoiceEntry = entryOf(READINGS.invoiceService, { ...EXAMPLE_OVERSEER, url: 'http://127.0.0.1:4958/' });
    expect(WatchReadingUtil.unreachableReadingOf(invoiceEntry, READINGS.invoiceService))
      .toEqual({ ...READINGS.invoiceService, fidelity: 'unreachable', condition: 'unreachable' });
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
  test('carry the entry and its Overseer, and no last command, which the registry ingestion does not map', () => {
    expect(WatchReadingUtil.registryFactsOf(entryOf(READINGS.designSystem, EXAMPLE_OVERSEER), EXAMPLE_OVERSEER)).toEqual({
      trackerId:         READINGS.designSystem.trackerId,
      project:           READINGS.designSystem.project,
      root:              READINGS.designSystem.root,
      overseerUrl:       EXAMPLE_OVERSEER.url,
      overseerProcessId: EXAMPLE_OVERSEER.processId,
      lastCommand:       null,
      lastChangedAt:     null,
    });
  });
});
