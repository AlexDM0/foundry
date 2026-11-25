/**
 * The detail route contract the board views open the panel through. What matters: each form round-trips through its item text, an
 * unknown form or an id the form cannot carry opens nothing, a board-only tab's item is never a detail, a second opener click on what is
 * open closes it, and an epic is pointed at on the Epics tab only. The ticket form's section rides after its id: it round-trips, an
 * unknown or empty one opens Overview so a stale link still opens the ticket, and it never changes which item is open, so an opener
 * closes the ticket whatever section shows.
 */
import { describe, expect, test } from 'bun:test';

import {
  DetailRoute,
  TICKET_SECTIONS,
  type DetailItem,
  type TicketSection
} from './DetailRoute.ts';

describe('the detail forms', () => {
  test.each<[DetailItem, string]>([
    [{ form: 'ticket', ticketId: '004' }, 'ticket/004'],
    [{ form: 'task-row', taskId: 12 }, 'task-row/12'],
    [{ form: 'ticket-row', ticketId: '004' }, 'ticket-row/004'],
    [{ form: 'draft', draftId: 'D7' }, 'draft/D7'],
  ])('%o reads and writes as %s', (item, itemText) => {
    expect(DetailRoute.itemTextOf(item)).toBe(itemText);
    expect(DetailRoute.detailItemOf(itemText)).toEqual(item);
  });

  test('an unknown form, a missing id or a row id that is no number opens nothing', () => {
    expect(['merge-queue', 'epic/checkout', 'ticket/', 'task-row/twelve', '004'].map(DetailRoute.detailItemOf)).toEqual([null, null, null, null, null]);
    expect(DetailRoute.detailItemOf(null)).toBeNull();
  });

  test('only the board tabs open a detail', () => {
    expect(DetailRoute.openDetailOf({ tab: 'waves', item: 'ticket/004' })).toEqual({ form: 'ticket', ticketId: '004' });
    expect(DetailRoute.openDetailOf({ tab: 'agents', item: 'ticket/004' })).toBeNull();
    expect(DetailRoute.openDetailOf({ tab: 'kanban', item: 'merge-queue' })).toBeNull();
  });
});

describe('the ticket form\'s sections', () => {
  test('a section after the ticket id reads as that section', () => {
    expect(DetailRoute.detailItemOf('ticket/004/timeline')).toEqual({ form: 'ticket', ticketId: '004', section: 'timeline' });
  });

  test('Overview, an empty or an unknown section reads as the ticket on Overview; a further segment opens nothing', () => {
    expect(['ticket/004/overview', 'ticket/004/', 'ticket/004/unknown'].map(DetailRoute.detailItemOf)).toEqual([
      { form: 'ticket', ticketId: '004' },
      { form: 'ticket', ticketId: '004' },
      { form: 'ticket', ticketId: '004' },
    ]);
    expect(DetailRoute.detailItemOf('ticket/004/timeline/extra')).toBeNull();
    expect(DetailRoute.detailItemOf('task-row/9/timeline')).toBeNull();
  });

  test.each<[TicketSection]>(TICKET_SECTIONS.map((section) => [section]))('the %s section round-trips through the route, Overview written without a section', (section) => {
    const routeItemText = DetailRoute.routeItemTextOf({ form: 'ticket', ticketId: '004', section });
    expect(routeItemText).toBe(section === 'overview' ? 'ticket/004' : `ticket/004/${section}`);
    expect(DetailRoute.detailItemOf(routeItemText)).toEqual(section === 'overview' ? { form: 'ticket', ticketId: '004' } : { form: 'ticket', ticketId: '004', section });
    expect(DetailRoute.sectionRouteOf('gantt', '004', section)).toEqual({ tab: 'gantt', item: routeItemText });
  });

  test('a section never changes which item is open, so the opener closes the ticket from any section', () => {
    const onActivity: DetailItem = { form: 'ticket', ticketId: '004', section: 'activity' };
    const card: DetailItem = { form: 'ticket', ticketId: '004' };
    expect(DetailRoute.itemTextOf(onActivity)).toBe('ticket/004');
    expect(DetailRoute.detailItemsAreEqual(onActivity, card)).toBe(true);
    expect(DetailRoute.openerRouteOf('kanban', onActivity, card)).toEqual({ tab: 'kanban', item: null });
  });
});

describe('the openers', () => {
  test('an opener keeps its tab and opens its item; on the item already open it closes the panel', () => {
    const item: DetailItem = { form: 'ticket', ticketId: '004' };
    expect(DetailRoute.openerRouteOf('kanban', null, item)).toEqual({ tab: 'kanban', item: 'ticket/004' });
    expect(DetailRoute.openerRouteOf('kanban', { form: 'ticket-row', ticketId: '004' }, item)).toEqual({ tab: 'kanban', item: 'ticket/004' });
    expect(DetailRoute.openerRouteOf('kanban', item, item)).toEqual({ tab: 'kanban', item: null });
  });

  test('an epic is pointed at on the Epics tab only', () => {
    expect(DetailRoute.epicItemTextOf('checkout')).toBe('epic/checkout');
    expect(DetailRoute.pointedEpicKeyOf({ tab: 'epics', item: 'epic/checkout' })).toBe('checkout');
    expect(DetailRoute.pointedEpicKeyOf({ tab: 'gantt', item: 'epic/checkout' })).toBeNull();
    expect(DetailRoute.pointedEpicKeyOf({ tab: 'epics', item: 'ticket/004' })).toBeNull();
  });
});
