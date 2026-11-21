/**
 * Whether a view may print whole seconds. What matters: the Agents view shows its agents' running times, so the page clock ticks every
 * second there; every other view, agents with no start, and the time before the first document print none, so the clock keeps its
 * ten-second tick.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument }                               from '../@types/FleetDocument.ts';
import { HashRouter }                                       from '../shared/HashRouter.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../testing/fixtures/fleet-five-forges.ts';
import { SecondsOnScreen }                                  from './SecondsOnScreen.ts';

const STOREFRONT = FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront;

const NOTHING_IN_SECONDS: FleetDocument = {
  ...FLEET_FIVE_FORGES,
  forges: FLEET_FIVE_FORGES.forges.map((forge) => ({ ...forge, agents: forge.agents.map((row) => ({ ...row, startedAt: null })) })),
};

function secondsMayShowAt(fragment: string, fleetDocument: FleetDocument | null): boolean {
  return SecondsOnScreen.secondsMayShowIn(HashRouter.routeOf(fragment), fleetDocument);
}

describe('whether a view may print whole seconds', () => {
  test('agents with a start show their running time on the Agents view only', () => {
    expect(['#agents', '#attention', '#forges', `#forge/${STOREFRONT}`, '#activity'].map((fragment) => secondsMayShowAt(fragment, FLEET_FIVE_FORGES)))
      .toEqual([true, false, false, false, false]);
  });

  test('no timed agent, or no document yet, prints no seconds', () => {
    expect(['#attention', '#agents', '#forges'].map((fragment) => secondsMayShowAt(fragment, NOTHING_IN_SECONDS))).toEqual([false, false, false]);
    expect(secondsMayShowAt('#agents', null)).toBe(false);
  });
});
