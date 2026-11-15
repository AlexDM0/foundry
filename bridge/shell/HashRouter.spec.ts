/**
 * The hash routes. What matters: `#<tab>` and `#<tab>/<item>` round-trip with each item segment encoded on its own, a malformed escape
 * stays as written instead of throwing (a throw takes down the page on every reload of that link), a fragment naming no
 * tab falls back to the stored tab, then the first; the board tabs come in their order before the others, Pipeline last; Waves and Epics
 * drop out on a board without dependencies or epics; a board with no readable pipeline shows Pipeline alone, so even a stored Kanban
 * routes there; and a route to a tab not shown falls back to the first shown tab, not to Kanban.
 */
import { describe, expect, test } from 'bun:test';

import { BRIDGE_TABS, HashRouter } from './HashRouter.ts';

describe('the hash router', () => {
  test('a malformed escape in an item segment stays as written, and the other segments still decode', () => {
    expect(HashRouter.routeOf('#agents/%E0%A4%A', null)).toEqual({ tab: 'agents', item: '%E0%A4%A' });
    expect(HashRouter.routeOf('#kanban/ticket/%', null)).toEqual({ tab: 'kanban', item: 'ticket/%' });
    expect(HashRouter.routeOf('#tickets/a%20b/%', null)).toEqual({ tab: 'tickets', item: 'a b/%' });
  });

  test('a tab and a tab with an item round-trip', () => {
    expect(HashRouter.routeOf('#agents/J12', null)).toEqual({ tab: 'agents', item: 'J12' });
    expect(HashRouter.routeOf('#tickets', null)).toEqual({ tab: 'tickets', item: null });
    expect(HashRouter.fragmentOf({ tab: 'agents', item: 'J12' })).toBe('#agents/J12');
    expect(HashRouter.fragmentOf({ tab: 'tickets', item: 'ticket-row/042' })).toBe('#tickets/ticket-row/042');
    expect(HashRouter.routeOf(HashRouter.fragmentOf({ tab: 'tickets', item: 'a/b c' }), null)).toEqual({ tab: 'tickets', item: 'a/b c' });
  });

  test('a fragment naming no tab falls back to the stored tab, then the first', () => {
    expect(HashRouter.routeOf('', 'questions')).toEqual({ tab: 'questions', item: null });
    expect(HashRouter.routeOf('#nowhere', 'not-a-tab')).toEqual({ tab: 'kanban', item: null });
  });
});

describe('the tabs shown', () => {
  test('the board tabs come first in their order, then the others, Pipeline last', () => {
    expect(BRIDGE_TABS).toEqual(['kanban', 'waves', 'progress', 'epics', 'tickets', 'agents', 'questions', 'assistant', 'intake', 'pipeline']);
  });

  test('Waves and Epics drop out only once the board says it has none, and a route to a dropped tab falls back to the first', () => {
    expect(HashRouter.shownTabsOf(null, null, true)).toEqual([...BRIDGE_TABS]);
    const shown = HashRouter.shownTabsOf(false, false, null);
    expect(shown).toEqual(['kanban', 'progress', 'tickets', 'agents', 'questions', 'assistant', 'intake']);
    expect(HashRouter.shownRouteOf({ tab: 'waves', item: null }, shown)).toEqual({ tab: 'kanban', item: null });
    expect(HashRouter.shownRouteOf({ tab: 'progress', item: 'task-row/3' }, shown)).toEqual({ tab: 'progress', item: 'task-row/3' });
  });

  test('Pipeline shows last once the board has a readable pipeline, and not while the board says nothing of one', () => {
    expect(HashRouter.shownTabsOf(true, true, true).at(-1)).toBe('pipeline');
    expect(HashRouter.shownTabsOf(true, true, null)).not.toContain('pipeline');
  });

  test('a board with no readable pipeline shows Pipeline alone, and a stored Kanban routes there', () => {
    const shown = HashRouter.shownTabsOf(true, true, false);
    expect(shown).toEqual(['pipeline']);
    expect(HashRouter.shownRouteOf(HashRouter.routeOf('', 'kanban'), shown)).toEqual({ tab: 'pipeline', item: null });
    expect(HashRouter.shownRouteOf(HashRouter.routeOf('#kanban/ticket/002', null), shown)).toEqual({ tab: 'pipeline', item: null });
    expect(HashRouter.shownRouteOf(HashRouter.routeOf('#pipeline/setup/research', null), shown)).toEqual({ tab: 'pipeline', item: 'setup/research' });
  });

  test('a route to a tab not shown falls back to the first shown tab, not to Kanban', () => {
    expect(HashRouter.shownRouteOf({ tab: 'kanban', item: null }, ['agents', 'questions'])).toEqual({ tab: 'agents', item: null });
  });
});
