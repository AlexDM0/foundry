/**
 * A board route as Gaia's address writes and reads it (`docs/design/board-menu.md`). What matters: the tracker id and every item segment
 * are encoded each on its own, so an item of several segments keeps its separators and round-trips; a malformed escape stays as written
 * instead of throwing (a throw takes down the page on every reload of that link); the Progress views live under `progress/`, and an old
 * `kanban`, `waves` or `progress` link reads as the view it named, a ticket's or draft's detail on the Kanban as that detail on Tickets; a
 * path naming no place falls back to the stored tab, an old stored tab read the same way, then the first; the menu comes in its order with
 * Progress for its three views; Waves and Epics drop out on a board without dependencies or epics, Waves from the Progress views too; the
 * Progress entry opens the open view, else the remembered one while shown, else the Kanban; a board with no readable pipeline shows
 * Pipeline alone, so even a stored Kanban routes there; a route to a tab not shown falls back to the first shown tab; and a served target
 * opens the tab and item for its subject, a ticket and a draft on Tickets.
 */
import { describe, expect, test } from 'bun:test';

import { BOARD_MENU_ENTRIES, BOARD_TABS, BoardRouter } from './BoardRouter.ts';

describe('a board route in Gaia\'s address', () => {
  test('names the forge, then the tab alone when no item is open', () => {
    expect(BoardRouter.fragmentOf('example', { tab: 'questions', item: null })).toBe('#forge/example/questions');
  });

  test('encodes the tracker id and each item segment apart, keeping the separators between them', () => {
    expect(BoardRouter.fragmentOf('example tracker/1', { tab: 'tickets', item: 'ticket-row/0 4' })).toBe('#forge/example%20tracker%2F1/tickets/ticket-row/0%204');
  });

  test('writes each Progress view under progress, its item after it', () => {
    expect([
      BoardRouter.fragmentOf('example', { tab: 'kanban', item: null }),
      BoardRouter.fragmentOf('example', { tab: 'waves', item: 'ticket/004' }),
      BoardRouter.fragmentOf('example', { tab: 'gantt', item: 'task-row/3' }),
    ]).toEqual(['#forge/example/progress/kanban', '#forge/example/progress/waves/ticket/004', '#forge/example/progress/gantt/task-row/3']);
  });
});

describe('the board\'s path read as a route', () => {
  test('a malformed escape in an item segment stays as written, and the other segments still decode', () => {
    expect(BoardRouter.routeOf('agents/%E0%A4%A', null)).toEqual({ tab: 'agents', item: '%E0%A4%A' });
    expect(BoardRouter.routeOf('progress/kanban/merge-queue/%', null)).toEqual({ tab: 'kanban', item: 'merge-queue/%' });
    expect(BoardRouter.routeOf('tickets/a%20b/%', null)).toEqual({ tab: 'tickets', item: 'a b/%' });
  });

  test('a tab and a tab with an item read back as written, a Progress view under progress', () => {
    expect(BoardRouter.routeOf('agents/J12', null)).toEqual({ tab: 'agents', item: 'J12' });
    expect(BoardRouter.routeOf('tickets', null)).toEqual({ tab: 'tickets', item: null });
    expect(BoardRouter.routeOf('tickets/a/b%20c', null)).toEqual({ tab: 'tickets', item: 'a/b c' });
    expect(BoardRouter.routeOf('progress/waves', null)).toEqual({ tab: 'waves', item: null });
    expect(BoardRouter.routeOf('progress/gantt/task-row/3', null)).toEqual({ tab: 'gantt', item: 'task-row/3' });
  });

  test('an old link reads as the view it named, and a ticket\'s or draft\'s detail on the Kanban as that detail on Tickets', () => {
    expect([
      BoardRouter.routeOf('kanban', null),
      BoardRouter.routeOf('kanban/merge-queue', null),
      BoardRouter.routeOf('kanban/ticket/002', null),
      BoardRouter.routeOf('kanban/draft/D7', null),
      BoardRouter.routeOf('waves/ticket/004', null),
      BoardRouter.routeOf('progress', null),
      BoardRouter.routeOf('progress/task-row/3', null),
    ]).toEqual([
      { tab: 'kanban', item: null },
      { tab: 'kanban', item: 'merge-queue' },
      { tab: 'tickets', item: 'ticket/002' },
      { tab: 'tickets', item: 'draft/D7' },
      { tab: 'waves', item: 'ticket/004' },
      { tab: 'gantt', item: null },
      { tab: 'gantt', item: 'task-row/3' },
    ]);
  });

  test('only an old link\'s place is old, so only it is redirected', () => {
    expect([
      BoardRouter.placeIsOld('kanban', []),
      BoardRouter.placeIsOld('waves', ['ticket', '004']),
      BoardRouter.placeIsOld('progress', []),
      BoardRouter.placeIsOld('progress', ['task-row', '3']),
      BoardRouter.placeIsOld('progress', ['kanban']),
      BoardRouter.placeIsOld('tickets', ['ticket', '002']),
    ]).toEqual([true, true, true, true, false, false]);
  });

  test('a Progress view is no place of its own, outside progress', () => {
    expect([BoardRouter.routeOfPlace('gantt', []), BoardRouter.routeOfPlace('nowhere', [])]).toEqual([null, null]);
  });

  test('a path naming no place falls back to the stored tab, an old stored tab read as its view, then the first', () => {
    expect(BoardRouter.routeOf(null, 'questions')).toEqual({ tab: 'questions', item: null });
    expect(BoardRouter.routeOf('', 'gantt')).toEqual({ tab: 'gantt', item: null });
    expect(BoardRouter.routeOf(null, 'progress')).toEqual({ tab: 'gantt', item: null });
    expect(BoardRouter.routeOf('nowhere', 'not-a-tab')).toEqual({ tab: 'tickets', item: null });
  });
});

describe('the menu and the tabs shown', () => {
  test('the menu comes in its order, and the tabs in the menu\'s order with the Progress views in its place, then the documents page', () => {
    expect(BOARD_MENU_ENTRIES).toEqual(['tickets', 'progress', 'epics', 'agents', 'questions', 'assistant', 'intake', 'pipeline']);
    expect(BOARD_TABS).toEqual(['tickets', 'kanban', 'waves', 'gantt', 'epics', 'agents', 'questions', 'assistant', 'intake', 'pipeline', 'documents']);
  });

  test('Waves and Epics drop out only once the board says it has none, Waves from the Progress views too', () => {
    expect(BoardRouter.shownTabsOf(null, null, true)).toEqual(BOARD_TABS.filter((tab) => tab !== 'documents'));
    const shown = BoardRouter.shownTabsOf(false, false, null);
    expect(shown).toEqual(['tickets', 'kanban', 'gantt', 'agents', 'questions', 'assistant', 'intake']);
    expect(BoardRouter.shownMenuEntriesOf(shown)).toEqual(['tickets', 'progress', 'agents', 'questions', 'assistant', 'intake']);
    expect(BoardRouter.shownProgressViewsOf(shown)).toEqual(['kanban', 'gantt']);
    expect(BoardRouter.shownRouteOf({ tab: 'waves', item: null }, shown)).toEqual({ tab: 'tickets', item: null });
    expect(BoardRouter.shownRouteOf({ tab: 'gantt', item: 'task-row/3' }, shown)).toEqual({ tab: 'gantt', item: 'task-row/3' });
  });

  test('a Progress view and a ticket\'s documents stand under their menu entries', () => {
    expect([BoardRouter.menuEntryOf('waves'), BoardRouter.menuEntryOf('documents'), BoardRouter.menuEntryOf('agents')]).toEqual(['progress', 'tickets', 'agents']);
  });

  test('the Progress entry opens the open view, else the remembered one while the board shows it, else the Kanban', () => {
    const withWaves = BoardRouter.shownTabsOf(true, true, true);
    const withoutWaves = BoardRouter.shownTabsOf(false, true, true);
    expect([
      BoardRouter.progressViewToOpenOf('gantt', 'waves', withWaves),
      BoardRouter.progressViewToOpenOf('tickets', 'waves', withWaves),
      BoardRouter.progressViewToOpenOf('tickets', 'waves', withoutWaves),
      BoardRouter.progressViewToOpenOf('tickets', null, withWaves),
      BoardRouter.progressViewToOpenOf('tickets', 'not-a-view', withWaves),
    ]).toEqual(['gantt', 'waves', 'kanban', 'kanban', 'kanban']);
    expect([BoardRouter.routeOfMenuEntry('progress', 'gantt'), BoardRouter.routeOfMenuEntry('epics', 'gantt')])
      .toEqual([{ tab: 'gantt', item: null }, { tab: 'epics', item: null }]);
  });

  test('Pipeline shows last once the board has a readable pipeline, and not while the board says nothing of one', () => {
    expect(BoardRouter.shownTabsOf(true, true, true).at(-1)).toBe('pipeline');
    expect(BoardRouter.shownTabsOf(true, true, null)).not.toContain('pipeline');
  });

  test('a board with no readable pipeline shows Pipeline alone, and a stored Kanban routes there', () => {
    const shown = BoardRouter.shownTabsOf(true, true, false);
    expect(shown).toEqual(['pipeline']);
    expect(BoardRouter.shownRouteOf(BoardRouter.routeOf(null, 'kanban'), shown)).toEqual({ tab: 'pipeline', item: null });
    expect(BoardRouter.shownRouteOf(BoardRouter.routeOf('tickets/ticket/002', null), shown)).toEqual({ tab: 'pipeline', item: null });
    expect(BoardRouter.shownRouteOf(BoardRouter.routeOf('pipeline/setup/research', null), shown)).toEqual({ tab: 'pipeline', item: 'setup/research' });
  });

  test('a route to a tab not shown falls back to the first shown tab, not to Tickets', () => {
    expect(BoardRouter.shownRouteOf({ tab: 'kanban', item: null }, ['agents', 'questions'])).toEqual({ tab: 'agents', item: null });
  });
});

describe('a ticket\'s documents page', () => {
  test('is reached by its route with an item and never shows in the menu', () => {
    const route = BoardRouter.documentsRouteOf('004', 'plan');
    expect(route).toEqual({ tab: 'documents', item: 'ticket/004/plan' });
    expect(BoardRouter.shownTabsOf(true, true, true)).not.toContain('documents');
    expect(BoardRouter.shownRouteOf(route, BoardRouter.shownTabsOf(true, true, true))).toEqual(route);
    expect(BoardRouter.routeOf('documents/ticket/004/spec', null)).toEqual({ tab: 'documents', item: 'ticket/004/spec' });
  });

  test('without an item falls back to the first shown tab, and a stored documents tab opens the default tab', () => {
    expect(BoardRouter.shownRouteOf({ tab: 'documents', item: null }, ['kanban', 'agents'])).toEqual({ tab: 'kanban', item: null });
    expect(BoardRouter.routeOf(null, 'documents')).toEqual({ tab: 'tickets', item: null });
  });

  test('names the ticket and the document of its item, and nothing for an item of another form', () => {
    expect(BoardRouter.documentOfRoute({ tab: 'documents', item: 'ticket/004/spec' })).toEqual({
      ticketId: '004', document: 'spec', line: null, questionId: null
    });
    const items = [
      'ticket/004/brief',
      'ticket/004',
      'draft/D1/spec',
      'ticket/004/spec/extra',
      'ticket/004/spec/line/0',
      'ticket/004/spec/line/x',
      'ticket/004/spec/line/3/4',
      'ticket/004/spec/question/C3',
      'ticket/004/spec/question/E7/line/3',
    ];
    expect(items.map((item) => BoardRouter.documentOfRoute({ tab: 'documents', item }))).toEqual(items.map(() => null));
  });

  test('opens the document at a line of its head when its route names one', () => {
    const route = BoardRouter.documentsRouteOf('004', 'spec', 16);
    expect(route).toEqual({ tab: 'documents', item: 'ticket/004/spec/line/16' });
    expect(BoardRouter.documentOfRoute(route)).toEqual({
      ticketId: '004', document: 'spec', line: 16, questionId: null
    });
    expect(BoardRouter.fragmentOf('tracker-1', route)).toBe('#forge/tracker-1/documents/ticket/004/spec/line/16');
    expect(BoardRouter.documentOfRoute({ tab: 'kanban', item: 'ticket/004/spec' })).toBeNull();
  });

  test('names the agent\'s question it unfolds, so two questions on one line, or one whose lines are gone, each open their own', () => {
    const route = BoardRouter.documentsRouteOf('004', 'spec', 14, 'E8');
    expect(route).toEqual({ tab: 'documents', item: 'ticket/004/spec/line/14/question/E8' });
    expect(BoardRouter.documentOfRoute(route)).toEqual({
      ticketId: '004', document: 'spec', line: 14, questionId: 'E8'
    });
    expect(BoardRouter.documentOfRoute(BoardRouter.documentsRouteOf('004', 'plan', null, 'E2'))).toEqual({
      ticketId: '004', document: 'plan', line: null, questionId: 'E2'
    });
  });
});

describe('the route of a served target', () => {
  test('a decision opens its question, a ticket or draft its detail on Tickets, a job its agent, an incident the Assistant alone', () => {
    expect(BoardRouter.routeOfTarget({ subject: 'decision', id: 'E3' })).toEqual({ tab: 'questions', item: 'E3' });
    expect(BoardRouter.routeOfTarget({ subject: 'ticket', id: '042' })).toEqual({ tab: 'tickets', item: 'ticket/042' });
    expect(BoardRouter.routeOfTarget({ subject: 'draft', id: 'D2' })).toEqual({ tab: 'tickets', item: 'draft/D2' });
    expect(BoardRouter.routeOfTarget({ subject: 'job', id: 'J12' })).toEqual({ tab: 'agents', item: 'J12' });
    expect(BoardRouter.routeOfTarget({ subject: 'incident', id: 'I5' })).toEqual({ tab: 'assistant', item: null });
  });
});
