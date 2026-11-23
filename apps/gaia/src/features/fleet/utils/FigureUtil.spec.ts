/**
 * The fleet's figures and machine facts. What matters: each figure sums only the forges that report it, so a value no forge
 * reported adds nothing rather than a guessed zero; the forges that cannot vouch for their figures, a counts-only one first among them, are
 * named in `incompleteFor`; and the machine-wide limit is taken from a forge read in full now before a reading kept from before a stop.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_SNAPSHOT_DEGRADED }             from '../../../adapters/page-api/testing/fleet-snapshot-degraded.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES_READINGS } from '../../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import type { ForgeConcurrency, ForgeReading } from '../../../shared/@types/ForgeReading.ts';

import { FigureUtil } from './FigureUtil.ts';

const READINGS = FLEET_SNAPSHOT_FIVE_FORGES_READINGS;

const LIVE_CONCURRENCY: ForgeConcurrency = {
  limit:                        5,
  agentsInFlight:               4,
  machineLimit:                 12,
  machineAgentsInFlight:        10,
  ticketsWaitingForMachineSlot: 0,
};

function readingWithConcurrency(reading: ForgeReading, changes: Partial<ForgeConcurrency>): ForgeReading {
  return { ...reading, concurrency: { ...LIVE_CONCURRENCY, ...changes } };
}

const RESEARCH_WIKI_COUNTS_ONLY = FLEET_SNAPSHOT_DEGRADED.forges.find((reading) => reading.fidelity === 'counts-only');

function countsOnlyWiki(): ForgeReading {
  if (RESEARCH_WIKI_COUNTS_ONLY === undefined) throw new Error('The degraded fixture holds no counts-only forge.');
  return RESEARCH_WIKI_COUNTS_ONLY;
}

describe('figuresOf', () => {
  test('names a counts-only forge in incompleteFor', () => {
    expect(FigureUtil.figuresOf([READINGS.exampleStorefront, countsOnlyWiki()], 2).incompleteFor).toEqual([countsOnlyWiki().trackerId]);
  });

  test('names an unreachable and a newer forge too, and no forge read in full, dormant or gone', () => {
    const unreachable = { ...READINGS.invoiceService, fidelity: 'unreachable' as const, condition: 'unreachable' as const };
    const newer       = { ...READINGS.researchWiki, fidelity: 'newer-contract' as const, condition: 'unreadable' as const };
    const figures     = FigureUtil.figuresOf([READINGS.exampleStorefront, unreachable, newer, READINGS.designSystem, READINGS.legacyImporter], 0);
    expect(figures.incompleteFor).toEqual([unreachable.trackerId, newer.trackerId]);
  });

  test('sums each figure over the forges that report it and adds nothing for one that does not', () => {
    expect(FigureUtil.figuresOf([READINGS.exampleStorefront, countsOnlyWiki(), READINGS.legacyImporter], 3)).toEqual({
      waitingOnUser:  3,
      agentsInFlight: 5,
      machineLimit:   12,
      readyTickets:   4,
      deliveredToday: 3,
      tokensToday:    512_000,
      openIncidents:  0,
      incompleteFor:  [countsOnlyWiki().trackerId],
    });
  });

  test('counts a counts-only forge\'s agents in flight as the jobs its summary lists', () => {
    expect(FigureUtil.figuresOf([countsOnlyWiki()], 0).agentsInFlight).toBe(countsOnlyWiki().agents.length);
  });

  test('counts no agent in flight for a dormant forge, whatever it reported before its stop', () => {
    const stoppedWhileBusy = readingWithConcurrency(READINGS.designSystem, { agentsInFlight: 3 });
    expect(FigureUtil.figuresOf([stoppedWhileBusy], 0).agentsInFlight).toBe(0);
  });

  test('takes the machine limit from a forge read in full before one kept from before a stop', () => {
    const limitedBeforeTheStop = readingWithConcurrency(READINGS.designSystem, { machineLimit: 4 });
    expect(FigureUtil.figuresOf([limitedBeforeTheStop, READINGS.exampleStorefront], 0).machineLimit).toBe(12);
    expect(FigureUtil.figuresOf([limitedBeforeTheStop, READINGS.legacyImporter], 0).machineLimit).toBe(4);
  });

  test('leaves the machine limit null while no forge enforces one', () => {
    const noMachineLimit = readingWithConcurrency(READINGS.exampleStorefront, { machineLimit: null });
    expect(FigureUtil.figuresOf([noMachineLimit, countsOnlyWiki()], 0).machineLimit).toBeNull();
  });
});

describe('machineFactsOf', () => {
  test('sums every reported forge limit and every ticket that waits for a machine slot', () => {
    const waitingForSlots = readingWithConcurrency(READINGS.invoiceService, { ticketsWaitingForMachineSlot: 2 });
    expect(FigureUtil.machineFactsOf([READINGS.exampleStorefront, waitingForSlots, READINGS.designSystem, countsOnlyWiki()], 12)).toEqual({
      cpuCount:                     12,
      agentsAskedForByForgeLimits:  12,
      ticketsWaitingForMachineSlot: 2,
    });
  });

  test('counts no ticket waiting for a slot from a forge that is not read in full now, whatever it reported before', () => {
    const stoppedWhileTicketsWaited     = readingWithConcurrency(READINGS.designSystem, { ticketsWaitingForMachineSlot: 2 });
    const unreachableWhileTicketsWaited = { ...readingWithConcurrency(READINGS.invoiceService, { ticketsWaitingForMachineSlot: 3 }), fidelity: 'unreachable' as const };
    const waitingForSlots               = readingWithConcurrency(READINGS.exampleStorefront, { ticketsWaitingForMachineSlot: 1 });
    expect(FigureUtil.machineFactsOf([stoppedWhileTicketsWaited, unreachableWhileTicketsWaited, waitingForSlots], 12).ticketsWaitingForMachineSlot).toBe(1);
    expect(FigureUtil.machineFactsOf([stoppedWhileTicketsWaited], 12).ticketsWaitingForMachineSlot).toBeNull();
  });

  test('leaves the tickets waiting for a slot null while no forge reports a machine limit', () => {
    expect(FigureUtil.machineFactsOf([countsOnlyWiki(), READINGS.legacyImporter], 8)).toEqual({
      cpuCount:                     8,
      agentsAskedForByForgeLimits:  0,
      ticketsWaitingForMachineSlot: null,
    });
  });
});
