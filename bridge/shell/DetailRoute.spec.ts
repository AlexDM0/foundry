/**
 * The detail route contract the board views open the panel through. What matters: each form round-trips through its item text, an
 * unknown form or an id the form cannot carry opens nothing, a Bridge-only tab's item is never a detail, a second opener click on what is
 * open closes it, and an epic is pointed at on the Epics tab only.
 */
import { describe, expect, test } from 'bun:test';

import { DetailRoute, type DetailItem } from './DetailRoute.ts';

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
    expect(DetailRoute.pointedEpicKeyOf({ tab: 'progress', item: 'epic/checkout' })).toBeNull();
    expect(DetailRoute.pointedEpicKeyOf({ tab: 'epics', item: 'ticket/004' })).toBeNull();
  });
});
