/**
 * Whether a view may print whole seconds. What matters: a running brain's countdown shows on Attention, Forges and the brain's own forge in
 * place, and the Agents view adds its agents' running times, so the page clock ticks every second there; Activity, a forge in place of
 * another forge, a brain with no end, and the time before the first document print none, so the clock keeps its ten-second tick.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument, FleetDocumentForge }                                     from '../@types/FleetDocument.ts';
import { HashRouter }                                                                 from '../shared/HashRouter.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_BRAINS, FLEET_FIVE_FORGES_TRACKER_IDS } from '../testing/fixtures/fleet-five-forges.ts';
import { SecondsOnScreen }                                                            from './SecondsOnScreen.ts';

const STOREFRONT = FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront;

function documentWith(changeForge: (forge: FleetDocumentForge) => FleetDocumentForge): FleetDocument {
  return { ...FLEET_FIVE_FORGES, forges: FLEET_FIVE_FORGES.forges.map(changeForge) };
}

const NOTHING_IN_SECONDS = documentWith((forge) => ({ ...forge, brain: 'not-reported', agents: forge.agents.map((row) => ({ ...row, startedAt: null })), }));

const STOREFRONT_BRAIN_COUNTS_DOWN = documentWith((forge) => (
  forge.trackerId === STOREFRONT ? { ...forge, brain: FLEET_FIVE_FORGES_BRAINS.running } : forge
));

const BRAIN_WITHOUT_END = { ...FLEET_FIVE_FORGES_BRAINS.running, endsAt: null };

const ONLY_A_BRAIN_WITHOUT_END = documentWith((forge) => ({ ...forge, agents: [], brain: forge.trackerId === STOREFRONT ? BRAIN_WITHOUT_END : 'not-reported' }));

const AGENTS_TIMED = documentWith((forge) => ({ ...forge, brain: 'not-reported' }));

function secondsMayShowAt(fragment: string, fleetDocument: FleetDocument | null): boolean {
  return SecondsOnScreen.secondsMayShowIn(HashRouter.routeOf(fragment), fleetDocument);
}

describe('whether a view may print whole seconds', () => {
  test('a running brain with an end counts down on Attention, Forges, Agents and its own forge in place, and nowhere else', () => {
    expect(['#attention', '#forges', '#agents', `#forge/${STOREFRONT}`, '#activity'].map((fragment) => secondsMayShowAt(fragment, STOREFRONT_BRAIN_COUNTS_DOWN)))
      .toEqual([true, true, true, true, false]);
    expect(secondsMayShowAt(`#forge/${FLEET_FIVE_FORGES_TRACKER_IDS.invoiceService}`, STOREFRONT_BRAIN_COUNTS_DOWN)).toBe(false);
  });

  test('agents with a start show their running time on the Agents view only', () => {
    expect(['#agents', '#attention', '#forges'].map((fragment) => secondsMayShowAt(fragment, AGENTS_TIMED))).toEqual([true, false, false]);
  });

  test('a brain with no end, no timed agent, or no document yet prints no seconds', () => {
    expect(['#attention', '#agents'].map((fragment) => secondsMayShowAt(fragment, ONLY_A_BRAIN_WITHOUT_END))).toEqual([false, false]);
    expect(['#attention', '#agents', '#forges'].map((fragment) => secondsMayShowAt(fragment, NOTHING_IN_SECONDS))).toEqual([false, false, false]);
    expect(secondsMayShowAt('#agents', null)).toBe(false);
  });
});
