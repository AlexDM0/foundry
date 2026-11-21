/**
 * A board route as Gaia's address writes and reads it. What matters: the tracker id and every item segment are encoded each on its own, so
 * an item of several segments keeps its separators and round-trips; a malformed escape stays as written instead of throwing (a throw takes
 * down the page on every reload of that link); a path naming no tab falls back to the stored tab, then the first; the board tabs come in
 * their order before the others, Pipeline last; Waves and Epics drop out on a board without dependencies or epics; a board with no readable
 * pipeline shows Pipeline alone, so even a stored Kanban routes there; a route to a tab not shown falls back to the first shown tab; and a
 * served target opens the tab and item the Bridge opens for its subject.
 */
import { describe, expect, test } from 'bun:test';

import { BOARD_TABS, BoardRouter } from './BoardRouter.ts';

describe('a board route in Gaia\'s address', () => {
  test('names the forge, then the tab alone when no item is open', () => {
    expect(BoardRouter.fragmentOf('example', { tab: 'questions', item: null })).toBe('#forge/example/questions');
  });

  test('encodes the tracker id and each item segment apart, keeping the separators between them', () => {
    expect(BoardRouter.fragmentOf('example tracker/1', { tab: 'tickets', item: 'ticket-row/0 4' })).toBe('#forge/example%20tracker%2F1/tickets/ticket-row/0%204');
  });
});

describe('the board\'s path read as a route', () => {
  test('a malformed escape in an item segment stays as written, and the other segments still decode', () => {
    expect(BoardRouter.routeOf('agents/%E0%A4%A', null)).toEqual({ tab: 'agents', item: '%E0%A4%A' });
    expect(BoardRouter.routeOf('kanban/ticket/%', null)).toEqual({ tab: 'kanban', item: 'ticket/%' });
    expect(BoardRouter.routeOf('tickets/a%20b/%', null)).toEqual({ tab: 'tickets', item: 'a b/%' });
  });

  test('a tab and a tab with an item read back as written', () => {
    expect(BoardRouter.routeOf('agents/J12', null)).toEqual({ tab: 'agents', item: 'J12' });
    expect(BoardRouter.routeOf('tickets', null)).toEqual({ tab: 'tickets', item: null });
    expect(BoardRouter.routeOf('tickets/a/b%20c', null)).toEqual({ tab: 'tickets', item: 'a/b c' });
  });

  test('a path naming no tab falls back to the stored tab, then the first', () => {
    expect(BoardRouter.routeOf(null, 'questions')).toEqual({ tab: 'questions', item: null });
    expect(BoardRouter.routeOf('', 'questions')).toEqual({ tab: 'questions', item: null });
    expect(BoardRouter.routeOf('nowhere', 'not-a-tab')).toEqual({ tab: 'kanban', item: null });
  });
});

describe('the tabs shown', () => {
  test('the board tabs come first in their order, then the others, Pipeline last', () => {
    expect(BOARD_TABS).toEqual(['kanban', 'waves', 'progress', 'epics', 'tickets', 'agents', 'questions', 'assistant', 'intake', 'pipeline']);
  });

  test('Waves and Epics drop out only once the board says it has none, and a route to a dropped tab falls back to the first', () => {
    expect(BoardRouter.shownTabsOf(null, null, true)).toEqual([...BOARD_TABS]);
    const shown = BoardRouter.shownTabsOf(false, false, null);
    expect(shown).toEqual(['kanban', 'progress', 'tickets', 'agents', 'questions', 'assistant', 'intake']);
    expect(BoardRouter.shownRouteOf({ tab: 'waves', item: null }, shown)).toEqual({ tab: 'kanban', item: null });
    expect(BoardRouter.shownRouteOf({ tab: 'progress', item: 'task-row/3' }, shown)).toEqual({ tab: 'progress', item: 'task-row/3' });
  });

  test('Pipeline shows last once the board has a readable pipeline, and not while the board says nothing of one', () => {
    expect(BoardRouter.shownTabsOf(true, true, true).at(-1)).toBe('pipeline');
    expect(BoardRouter.shownTabsOf(true, true, null)).not.toContain('pipeline');
  });

  test('a board with no readable pipeline shows Pipeline alone, and a stored Kanban routes there', () => {
    const shown = BoardRouter.shownTabsOf(true, true, false);
    expect(shown).toEqual(['pipeline']);
    expect(BoardRouter.shownRouteOf(BoardRouter.routeOf(null, 'kanban'), shown)).toEqual({ tab: 'pipeline', item: null });
    expect(BoardRouter.shownRouteOf(BoardRouter.routeOf('kanban/ticket/002', null), shown)).toEqual({ tab: 'pipeline', item: null });
    expect(BoardRouter.shownRouteOf(BoardRouter.routeOf('pipeline/setup/research', null), shown)).toEqual({ tab: 'pipeline', item: 'setup/research' });
  });

  test('a route to a tab not shown falls back to the first shown tab, not to Kanban', () => {
    expect(BoardRouter.shownRouteOf({ tab: 'kanban', item: null }, ['agents', 'questions'])).toEqual({ tab: 'agents', item: null });
  });
});

describe('the route of a served target', () => {
  test('a decision opens its question, a ticket or draft its detail on the Kanban, a job its agent, an incident the Assistant alone', () => {
    expect(BoardRouter.routeOfTarget({ subject: 'decision', id: 'E3' })).toEqual({ tab: 'questions', item: 'E3' });
    expect(BoardRouter.routeOfTarget({ subject: 'ticket', id: '042' })).toEqual({ tab: 'kanban', item: 'ticket/042' });
    expect(BoardRouter.routeOfTarget({ subject: 'draft', id: 'D2' })).toEqual({ tab: 'kanban', item: 'draft/D2' });
    expect(BoardRouter.routeOfTarget({ subject: 'job', id: 'J12' })).toEqual({ tab: 'agents', item: 'J12' });
    expect(BoardRouter.routeOfTarget({ subject: 'incident', id: 'I5' })).toEqual({ tab: 'assistant', item: null });
  });
});
