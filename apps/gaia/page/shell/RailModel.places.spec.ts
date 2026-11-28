/**
 * Where the rail leads a forge back to: the board route that forge showed last on this page, so leaving for another view and returning
 * reopens the same step or item. A forge's route without a board route keeps the place, and an unchanged place keeps the same map, so
 * the shell's render-time update settles.
 */
import { describe, expect, test } from 'bun:test';

import { DEFAULT_ROUTE, type GaiaRoute }                    from '../shared/HashRouter.ts';
import { FLEET_DEGRADED }                                   from '../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../testing/fixtures/fleet-five-forges.ts';
import { type ForgePlaces, NO_FORGE_PLACES, RailModel }     from './RailModel.ts';

const STOREFRONT_ID = FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront;

const INVOICE_ID = FLEET_FIVE_FORGES_TRACKER_IDS.invoiceService;

const RESEARCH_WIKI_ID = FLEET_FIVE_FORGES_TRACKER_IDS.researchWiki;

function forgeRouteOf(trackerId: string, tab: 'pipeline' | 'tickets' | null, item: string | null = null): GaiaRoute {
  return { view: 'forge', trackerId, boardRoute: tab === null ? null : { tab, item } };
}

function placesAfter(routes: readonly GaiaRoute[]): ForgePlaces {
  return routes.reduce(RailModel.forgePlacesAfterRoute, NO_FORGE_PLACES);
}

function forgeHrefOf(places: ForgePlaces, trackerId: string): string | undefined {
  return RailModel.railContentOf(FLEET_FIVE_FORGES, DEFAULT_ROUTE, null, places).forges.find((row) => row.trackerId === trackerId)?.href;
}

describe('the places the page remembers', () => {
  test('a forge keeps the last board route it showed, each forge its own', () => {
    const places = placesAfter([
      forgeRouteOf(STOREFRONT_ID, 'tickets', 'ticket/015'),
      forgeRouteOf(STOREFRONT_ID, 'pipeline', 'setup/research'),
      forgeRouteOf(INVOICE_ID, 'tickets'),
      DEFAULT_ROUTE,
    ]);
    expect([...places]).toEqual([
      [STOREFRONT_ID, { tab: 'pipeline', item: 'setup/research' }],
      [INVOICE_ID, { tab: 'tickets', item: null }],
    ]);
  });

  test('a forge opened without a board route keeps its place', () => {
    const places = placesAfter([forgeRouteOf(STOREFRONT_ID, 'pipeline', 'setup/research'), forgeRouteOf(STOREFRONT_ID, null)]);
    expect(places.get(STOREFRONT_ID)).toEqual({ tab: 'pipeline', item: 'setup/research' });
  });

  test('a route that changes no place answers the same map', () => {
    const places = placesAfter([forgeRouteOf(STOREFRONT_ID, 'pipeline', 'setup/research')]);
    expect(RailModel.forgePlacesAfterRoute(places, forgeRouteOf(STOREFRONT_ID, 'pipeline', 'setup/research'))).toBe(places);
    expect(RailModel.forgePlacesAfterRoute(places, DEFAULT_ROUTE)).toBe(places);
  });
});

describe('the rail leads a forge back to its place', () => {
  test('a forge left at its research step opens there again, and a forge never opened opens on its board alone', () => {
    const places = placesAfter([forgeRouteOf(STOREFRONT_ID, 'pipeline', 'setup/research')]);
    expect(forgeHrefOf(places, STOREFRONT_ID)).toBe(`#forge/${STOREFRONT_ID}/pipeline/setup/research`);
    expect(forgeHrefOf(places, INVOICE_ID)).toBe(`#forge/${INVOICE_ID}`);
  });

  test('a forge that cannot open in place still opens at its Forges row', () => {
    const places = placesAfter([forgeRouteOf(RESEARCH_WIKI_ID, 'tickets')]);
    const href = RailModel.railContentOf(FLEET_DEGRADED, DEFAULT_ROUTE, null, places).forges.find((row) => row.trackerId === RESEARCH_WIKI_ID)?.href;
    expect(href).toBe(`#forges?forge=${RESEARCH_WIKI_ID}`);
  });
});
