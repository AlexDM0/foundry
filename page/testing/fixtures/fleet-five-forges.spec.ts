/**
 * The fixture must hold the example data of artboards A1 to A4, or every view spec built on it checks the wrong screen. What matters: A1's
 * rows in their order with their ages, A2's ten agents and their running times, Flint's brain running on Example Storefront with A2's
 * 0:36 run and 1:24 left, outside every figure, A3's interleaved entries and daily sums, A4's limits, and the fleet-wide lists being copies
 * of their forges' own entries.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from './fleet-five-forges.ts';

const MILLISECONDS_PER_SECOND = 1000;

function secondsSince(stamp: string): number {
  return (Date.parse(FLEET_FIXTURES_READ_AT) - Date.parse(stamp)) / MILLISECONDS_PER_SECOND;
}

function projectOf(trackerId: string): string {
  return FLEET_FIVE_FORGES.forges.find((forge) => forge.trackerId === trackerId)?.project ?? 'no such forge';
}

describe('the fleet-five-forges fixture', () => {
  test('lists the five rows of A1 in its order, at the ages A1 shows', () => {
    const rows = FLEET_FIVE_FORGES.attention.map((item) => [projectOf(item.trackerId), item.idText, Math.floor(secondsSince(item.stamp) / 60)]);
    expect(rows).toEqual([
      ['Invoice Service', 'E4', 21],
      ['Example Storefront', '#015', 124],
      ['Research Wiki', 'E1', 26],
      ['Invoice Service', '#031', 12],
      ['Example Storefront', 'E2', 4],
    ]);
    expect(FLEET_FIVE_FORGES.figures.waitingOnUser).toBe(FLEET_FIVE_FORGES.attention.length);
  });

  test('holds the ten agents of A2, their running times, and tokens that sum to 821,300', () => {
    const jobRows = FLEET_FIVE_FORGES.agents.filter((row) => row.countsAgainstLimit);
    const runningTimes = jobRows.map((row) => `${projectOf(row.trackerId)} ${row.jobId} ${secondsSince(row.startedAt ?? FLEET_FIXTURES_READ_AT)}`);
    expect(runningTimes).toEqual([
      'Example Mobile App J5 2472',
      'Example Mobile App J7 303',
      'Example Storefront J2 724',
      'Example Storefront J3 580',
      'Example Storefront J4 190',
      'Example Storefront J6 382',
      'Invoice Service J11 1275',
      'Invoice Service J12 2042',
      'Invoice Service J14 531',
      'Research Wiki J2 990',
    ]);
    expect(jobRows.reduce((sum, row) => sum + row.tokens, 0)).toBe(821_300);
    expect(jobRows.filter((row) => row.role === 'builder')).toHaveLength(7);
    expect(jobRows.filter((row) => row.role === 'reviewer')).toHaveLength(3);
    const needingALook = jobRows.filter((row) => row.quiet === true || row.waitingOnDecisionId !== null).map((row) => row.jobId);
    expect(needingALook).toEqual(['J3', 'J12']);
  });

  test('holds Flint\'s brain running on Example Storefront, woken from Gaia 0:36 ago with 1:24 left, as its group\'s last row and in no figure', () => {
    const brainForges = FLEET_FIVE_FORGES.forges.flatMap((forge) => (forge.brain === 'not-reported' ? [] : [[forge.project, forge.brain.state]]));
    expect(brainForges).toEqual([['Example Storefront', 'running'], ['Invoice Service', 'off'], ['Research Wiki', 'off'], ['Example Mobile App', 'off']]);
    const storefront = FLEET_FIVE_FORGES.forges.find((forge) => forge.trackerId === FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront);
    const brain = storefront?.brain === 'not-reported' ? null : storefront?.brain;
    expect([secondsSince(brain?.startedAt ?? ''), -secondsSince(brain?.endsAt ?? ''), brain?.startedBy, brain?.model, brain?.effort, brain?.tokens, brain?.calls])
      .toEqual([36, 84, 'gaia', 'haiku', 'low', 3100, 9]);
    const brainRows = FLEET_FIVE_FORGES.agents.filter((row) => !row.countsAgainstLimit);
    expect(brainRows.map((row) => [projectOf(row.trackerId), row.jobId, row.role, row.tokens])).toEqual([['Example Storefront', 'flint-brain', 'brain', 3100]]);
    const storefrontRows = FLEET_FIVE_FORGES.agents.filter((row) => row.trackerId === FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront);
    expect(storefrontRows.at(-1)?.role).toBe('brain');
    expect([FLEET_FIVE_FORGES.figures.agentsInFlight, storefront?.concurrency?.agentsInFlight]).toEqual([10, 4]);
  });

  test('interleaves the sixteen entries of A3 newest first, and sums landed and tokens today as A3 does', () => {
    const stamps = FLEET_FIVE_FORGES.activity.map((entry) => entry.at);
    expect(stamps).toHaveLength(16);
    expect(stamps).toEqual([...stamps].sort().reverse());
    const todays = FLEET_FIVE_FORGES.forges.flatMap((forge) => (forge.today === null ? [] : [forge.today]));
    expect(todays.reduce((sum, today) => sum + today.deliveredTickets, 0)).toBe(FLEET_FIVE_FORGES.figures.deliveredToday);
    expect(todays.reduce((sum, today) => sum + today.tokens, 0)).toBe(1_240_000);
    expect(FLEET_FIVE_FORGES.figures.tokensToday).toBe(1_240_000);
  });

  test('holds the forges of A4, whose own limits ask for 17 agents of a machine of 12 CPUs', () => {
    const rows = FLEET_FIVE_FORGES.forges.map((forge) => [forge.project, forge.condition, forge.concurrency?.agentsInFlight, forge.concurrency?.limit, forge.codeVersion]);
    expect(rows).toEqual([
      ['Example Storefront', 'live', 4, 5, '3f9a2c1'],
      ['Invoice Service', 'live', 3, 5, '3f9a2c1'],
      ['Research Wiki', 'live', 1, 3, '3f9a2c1'],
      ['Example Mobile App', 'held', 2, 2, 'b81e07d'],
      ['Design System', 'dormant', 0, 2, '3f9a2c1'],
      ['Legacy Importer', 'missing', undefined, undefined, null],
    ]);
    const askedFor = FLEET_FIVE_FORGES.forges.reduce((sum, forge) => sum + (forge.concurrency?.limit ?? 0), 0);
    expect(FLEET_FIVE_FORGES.machine.agentsAskedForByForgeLimits).toBe(askedFor);
    expect(askedFor).toBe(17);
    expect(FLEET_FIVE_FORGES.machine.cpuCount).toBe(12);
    expect(FLEET_FIVE_FORGES.figures.agentsInFlight).toBe(10);
  });

  test('names the held forge and the dormant one with ready tickets as the two forges of A1 that need a look', () => {
    expect(FLEET_FIVE_FORGES.needsALook).toEqual([
      { trackerId: FLEET_FIVE_FORGES_TRACKER_IDS.exampleMobileApp, kind: 'launches-held' },
      { trackerId: FLEET_FIVE_FORGES_TRACKER_IDS.designSystem, kind: 'dormant-with-ready-tickets' },
    ]);
  });

  test('lists across the fleet only copies of what each forge holds itself', () => {
    const forgeOf = (trackerId: string) => FLEET_FIVE_FORGES.forges.find((forge) => forge.trackerId === trackerId);
    for (const { trackerId, ...item } of FLEET_FIVE_FORGES.attention) expect(forgeOf(trackerId)?.attention).toContainEqual(item);
    for (const { trackerId, countsAgainstLimit, ...row } of FLEET_FIVE_FORGES.agents) {
      const forge = forgeOf(trackerId);
      if (countsAgainstLimit) expect(forge?.agents).toContainEqual(row);
      else expect(forge?.brain === 'not-reported' ? null : [forge?.brain.state, forge?.brain.startedAt]).toEqual(['running', row.startedAt]);
    }
    for (const { trackerId, ...entry } of FLEET_FIVE_FORGES.activity) expect(forgeOf(trackerId)?.activity).toContainEqual(entry);
  });
});
