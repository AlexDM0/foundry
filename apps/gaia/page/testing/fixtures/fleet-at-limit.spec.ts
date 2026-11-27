/** The fixture must hold the at-the-limit data: the machine at a lowered limit with tickets waiting by forge, one forge paused, one starting. */
import { describe, expect, test } from 'bun:test';

import { FLEET_AT_LIMIT } from './fleet-at-limit.ts';

describe('the fleet-at-limit fixture', () => {
  test('holds the machine of B2 at its limit of 10, with 3 tickets waiting: 2 in Invoice Service, 1 in Research Wiki', () => {
    expect(FLEET_AT_LIMIT.figures.machineLimit).toBe(10);
    expect(FLEET_AT_LIMIT.figures.agentsInFlight).toBe(10);
    expect(FLEET_AT_LIMIT.machine).toEqual({ cpuCount: 12, agentsAskedForByForgeLimits: 17, ticketsWaitingForMachineSlot: 3 });
    const waitingByForge = FLEET_AT_LIMIT.forges.flatMap((forge) => {
      const waiting = forge.concurrency?.ticketsWaitingForMachineSlot ?? 0;
      return waiting > 0 && forge.condition !== 'dormant' && forge.condition !== 'starting' ? [[forge.project, waiting]] : [];
    });
    expect(waitingByForge).toEqual([['Invoice Service', 2], ['Research Wiki', 1]]);
  });

  test('shows the conditions of B2: Research Wiki paused with one agent finishing, Design System starting', () => {
    expect(FLEET_AT_LIMIT.forges.map((forge) => [forge.project, forge.condition])).toEqual([
      ['Example Storefront', 'live'],
      ['Invoice Service', 'live'],
      ['Research Wiki', 'paused'],
      ['Example Mobile App', 'held'],
      ['Design System', 'starting'],
      ['Legacy Importer', 'missing'],
    ]);
    expect(FLEET_AT_LIMIT.forges[2]?.concurrency?.agentsInFlight).toBe(1);
  });
});
