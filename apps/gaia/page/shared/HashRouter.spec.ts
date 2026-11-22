/**
 * The hash router. What matters: every route of `docs/design/screens.md`, the shell reads to its view and back to the same fragment; a forge's board is
 * read and written in one form, `#forge/<trackerId>[/<tab>[/<item segments>]]`, and the form with `#` before the tab reads as the forge
 * with no tab; a malformed escape reads as no segment; anything unknown or malformed is Attention, never a throw.
 */
import { describe, expect, test } from 'bun:test';

import { DEFAULT_ROUTE, type GaiaRoute, HashRouter } from './HashRouter.ts';

describe('reading a fragment', () => {
  test('every route the design reference names reads to its view', () => {
    expect([
      '#attention',
      '#agents',
      '#agents/example-storefront-7c41/J3',
      '#activity',
      '#forges',
      '#forges/add',
      '#forge/example-storefront-7c41',
      '#forge/example-storefront-7c41/questions/E2',
    ].map((fragment) => HashRouter.routeOf(fragment))).toEqual([
      { view: 'attention' },
      { view: 'agents', selectedAgent: null, query: '' },
      { view: 'agents', selectedAgent: { trackerId: 'example-storefront-7c41', jobId: 'J3' }, query: '' },
      { view: 'activity' },
      { view: 'forges', addingARepository: false, forgeInView: null },
      { view: 'forges', addingARepository: true, forgeInView: null },
      { view: 'forge', trackerId: 'example-storefront-7c41', boardRoute: null },
      { view: 'forge', trackerId: 'example-storefront-7c41', boardRoute: { tab: 'questions', item: 'E2' } },
    ]);
  });

  test('a board route reads its tab and its item, whose encoded segments read whole with the separator between them', () => {
    expect([
      '#forge/invoice-service-2b9e/agents/J11',
      '#forge/invoice-service-2b9e/kanban/ticket/T%2042',
      '#forge/invoice-service-2b9e/pipeline',
    ].map((fragment) => HashRouter.routeOf(fragment))).toEqual(([
      { tab: 'agents', item: 'J11' },
      { tab: 'kanban', item: 'ticket/T 42' },
      { tab: 'pipeline', item: null },
    ] as const).map((boardRoute): GaiaRoute => ({ view: 'forge', trackerId: 'invoice-service-2b9e', boardRoute })));
  });

  test('the form with # before the tab, and a path naming no board tab, read as the forge with no tab', () => {
    expect(['#questions/E2', '#tickets?epic=E3', 'settings', ''].map((boardPath) => HashRouter.routeOf(`#forge/invoice-service-2b9e/${boardPath}`)))
      .toEqual(Array.from({ length: 4 }, () => ({ view: 'forge', trackerId: 'invoice-service-2b9e', boardRoute: null })));
  });

  test('a malformed escape in the item reads as no item, and in the tracker id as no forge', () => {
    expect(HashRouter.routeOf('#forge/invoice-service-2b9e/agents/%E0%A4%A'))
      .toEqual({ view: 'forge', trackerId: 'invoice-service-2b9e', boardRoute: { tab: 'agents', item: null } });
    expect(HashRouter.routeOf('#forge/%E0%A4%A/agents/J11')).toEqual(DEFAULT_ROUTE);
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
      { view: 'forge', trackerId: 'example-storefront-7c41', boardRoute: { tab: 'questions', item: 'E2' } },
      { view: 'forge', trackerId: 'example-storefront-7c41', boardRoute: { tab: 'kanban', item: 'ticket/042' } },
      { view: 'forge', trackerId: 'example-storefront-7c41', boardRoute: null },
    ];
    expect(routes.map((route) => HashRouter.fragmentOf(route))).toEqual([
      '#attention',
      '#agents/invoice-service-2b9e/J12?role=reviewers',
      '#activity',
      '#forges/add',
      '#forges?forge=legacy-importer-0e7d',
      '#forge/example-storefront-7c41/questions/E2',
      '#forge/example-storefront-7c41/kanban/ticket/042',
      '#forge/example-storefront-7c41',
    ]);
    expect(routes.map((route) => HashRouter.routeOf(HashRouter.fragmentOf(route)))).toEqual(routes);
  });

  test('a tracker id with a separator in it is encoded, so it reads back whole', () => {
    const route: GaiaRoute = { view: 'forge', trackerId: 'odd/name 1', boardRoute: null };
    expect(HashRouter.fragmentOf(route)).toBe('#forge/odd%2Fname%201');
    expect(HashRouter.routeOf(HashRouter.fragmentOf(route))).toEqual(route);
  });
});
