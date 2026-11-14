/**
 * The hash router. What matters: every route of SCREENS "The shell" reads to its view and back to the same fragment; a forge in place
 * keeps the Bridge's own fragment verbatim, its `#` and query included; anything unknown or malformed is Attention, never a throw.
 */
import { describe, expect, test } from 'bun:test';

import { DEFAULT_ROUTE, type GaiaRoute, HashRouter } from './HashRouter.ts';

describe('reading a fragment', () => {
  test('every route SCREENS names reads to its view', () => {
    expect([
      '#attention',
      '#agents',
      '#agents/example-storefront-7c41/J3',
      '#activity',
      '#forges',
      '#forges/add',
      '#forge/example-storefront-7c41',
      '#forge/example-storefront-7c41/#questions/E2',
    ].map((fragment) => HashRouter.routeOf(fragment))).toEqual([
      { view: 'attention' },
      { view: 'agents', selectedAgent: null, query: '' },
      { view: 'agents', selectedAgent: { trackerId: 'example-storefront-7c41', jobId: 'J3' }, query: '' },
      { view: 'activity' },
      { view: 'forges', addingARepository: false, forgeInView: null },
      { view: 'forges', addingARepository: true, forgeInView: null },
      { view: 'forge', trackerId: 'example-storefront-7c41', bridgeFragment: null },
      { view: 'forge', trackerId: 'example-storefront-7c41', bridgeFragment: '#questions/E2' },
    ]);
  });

  test('the Bridge\'s fragment is kept verbatim, its own query included, and one written without its mark gains it', () => {
    const withQuery = HashRouter.routeOf('#forge/invoice-service-2b9e/#tickets?epic=E3&sort=age');
    expect(withQuery).toEqual({ view: 'forge', trackerId: 'invoice-service-2b9e', bridgeFragment: '#tickets?epic=E3&sort=age' });
    expect(HashRouter.routeOf('#forge/invoice-service-2b9e/agents/J11')).toEqual({ view: 'forge', trackerId: 'invoice-service-2b9e', bridgeFragment: '#agents/J11' });
  });

  test('the Agents view keeps its filters in the query, and the Forges view names the forge to bring into view', () => {
    expect(HashRouter.routeOf('#agents?role=builders&condition=needs-a-look')).toEqual({ view: 'agents', selectedAgent: null, query: 'role=builders&condition=needs-a-look' });
    expect(HashRouter.routeOf('#forges?forge=design-system-91c2')).toEqual({ view: 'forges', addingARepository: false, forgeInView: 'design-system-91c2' });
  });

  test('an empty, unknown or malformed fragment is Attention, and an agent route without its job selects none', () => {
    expect(['', '#', '#settings', '#forge/', '#forge/%E0%A4%A/#questions'].map((fragment) => HashRouter.routeOf(fragment))).toEqual([
      DEFAULT_ROUTE,
      DEFAULT_ROUTE,
      DEFAULT_ROUTE,
      DEFAULT_ROUTE,
      DEFAULT_ROUTE,
    ]);
    expect(HashRouter.routeOf('#agents/example-storefront-7c41')).toEqual({ view: 'agents', selectedAgent: null, query: '' });
  });
});

describe('writing a fragment', () => {
  test('each route writes the fragment that reads back to it', () => {
    const routes: GaiaRoute[] = [
      { view: 'attention' },
      { view: 'agents', selectedAgent: { trackerId: 'invoice-service-2b9e', jobId: 'J12' }, query: 'role=reviewers' },
      { view: 'activity' },
      { view: 'forges', addingARepository: true, forgeInView: null },
      { view: 'forges', addingARepository: false, forgeInView: 'legacy-importer-0e7d' },
      { view: 'forge', trackerId: 'example-storefront-7c41', bridgeFragment: '#questions/E2' },
    ];
    expect(routes.map((route) => HashRouter.fragmentOf(route))).toEqual([
      '#attention',
      '#agents/invoice-service-2b9e/J12?role=reviewers',
      '#activity',
      '#forges/add',
      '#forges?forge=legacy-importer-0e7d',
      '#forge/example-storefront-7c41/#questions/E2',
    ]);
    expect(routes.map((route) => HashRouter.routeOf(HashRouter.fragmentOf(route)))).toEqual(routes);
  });

  test('a tracker id with a separator in it is encoded, so it reads back whole', () => {
    const route: GaiaRoute = { view: 'forge', trackerId: 'odd/name 1', bridgeFragment: null };
    expect(HashRouter.fragmentOf(route)).toBe('#forge/odd%2Fname%201');
    expect(HashRouter.routeOf(HashRouter.fragmentOf(route))).toEqual(route);
  });
});
