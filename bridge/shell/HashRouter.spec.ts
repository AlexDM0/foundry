/**
 * The hash routes. What matters: `#<tab>` and `#<tab>/<item>` round-trip with each item segment encoded on its own, a fragment naming no
 * tab falls back to the stored tab, then the first; the tabs keep the static page's order before the Bridge's own, Waves and Epics drop
 * out on a board without dependencies or epics, and a route to a tab not shown falls back to the first.
 */
import { describe, expect, test } from 'bun:test';

import { BRIDGE_TABS, HashRouter } from './HashRouter.ts';

describe('the hash router', () => {
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
  test('the static page\'s tabs come first in its order, then the Bridge\'s own', () => {
    expect(BRIDGE_TABS).toEqual(['kanban', 'waves', 'progress', 'epics', 'tickets', 'agents', 'questions', 'assistant', 'intake']);
  });

  test('Waves and Epics drop out only once the board says it has none, and a route to a dropped tab falls back to the first', () => {
    expect(HashRouter.shownTabsOf(null, null)).toEqual([...BRIDGE_TABS]);
    const shown = HashRouter.shownTabsOf(false, false);
    expect(shown).toEqual(['kanban', 'progress', 'tickets', 'agents', 'questions', 'assistant', 'intake']);
    expect(HashRouter.shownRouteOf({ tab: 'waves', item: null }, shown)).toEqual({ tab: 'kanban', item: null });
    expect(HashRouter.shownRouteOf({ tab: 'progress', item: 'task-row/3' }, shown)).toEqual({ tab: 'progress', item: 'task-row/3' });
  });
});
