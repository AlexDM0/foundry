/**
 * The fixture must hold B3's example data. What matters: the four rows Gaia knows by name, the unreachable forge's rows kept as last
 * reported, the forges that cannot vouch for a figure named, and a counts-only job that reports no more than its summary holds.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_DEGRADED } from './fleet-degraded.ts';

function forgeNamed(project: string) {
  return FLEET_DEGRADED.forges.find((forge) => forge.project === project);
}

describe('the fleet-degraded fixture', () => {
  test('knows the four rows of B3 by name, two of them as Invoice Service last reported them at 13:14', () => {
    expect(FLEET_DEGRADED.attention.map((item) => item.idText)).toEqual(['E4', '#015', '#031', 'E2']);
    expect(FLEET_DEGRADED.figures.waitingOnUser).toBe(4);
    const invoiceService = forgeNamed('Invoice Service');
    expect(invoiceService?.fidelity).toBe('unreachable');
    expect(invoiceService?.lastReportedAt).toBe('2026-11-12T13:14:05.000Z');
    expect([invoiceService?.url, invoiceService?.processId]).toEqual(['http://127.0.0.1:4957', 48_211]);
  });

  test('names the unreachable, the counts-only and the newer forge as unable to vouch for the figures', () => {
    const named = FLEET_DEGRADED.figures.incompleteFor.map((trackerId) => FLEET_DEGRADED.forges.find((forge) => forge.trackerId === trackerId)?.fidelity);
    expect(named).toEqual(['unreachable', 'counts-only', 'newer-contract']);
    expect(forgeNamed('Research Wiki')?.attentionCount).toBe(1);
    expect(forgeNamed('Analytics Sandbox')?.contracts).toEqual({
      summary: 1,
      monitor: 4,
      control: 2,
      embed:   1,
    });
  });

  test('lists ten agents and Example Storefront\'s running brain, the counts-only one with only what its summary holds', () => {
    expect(FLEET_DEGRADED.agents.filter((row) => row.countsAgainstLimit)).toHaveLength(10);
    const brainRows = FLEET_DEGRADED.agents.filter((row) => !row.countsAgainstLimit);
    expect(brainRows.map((row) => [row.trackerId, row.role])).toEqual([[forgeNamed('Example Storefront')?.trackerId ?? null, 'brain']]);
    const countsOnlyJob = FLEET_DEGRADED.agents.find((row) => row.trackerId === forgeNamed('Research Wiki')?.trackerId);
    expect(countsOnlyJob).toMatchObject({
      jobId:     'J2',
      role:      'builder',
      ticketIds: ['007'],
      state:     'running',
      tokens:    103_490,
    });
    expect([countsOnlyJob?.calls, countsOnlyJob?.callBudget, countsOnlyJob?.startedAt, countsOnlyJob?.lastToolCall]).toEqual([null, null, null, null]);
  });
});
