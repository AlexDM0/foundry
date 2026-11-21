/**
 * Which form a routed detail opens. What matters: a Kanban or wave card's item opens the ticket form, a Gantt row's or ticket line's the
 * row form, a filing draft's the draft form; an item the board no longer holds opens one line naming it, since a route can outlive what it
 * names.
 */
import { describe, expect, test } from 'bun:test';

import {
  EXAMPLE_DETAIL_FORMAT,
  exampleDetailBoard,
  exampleDetailRow,
  exampleDetailTicket
} from '../../testing/DetailBoardFixture.ts';
import { DetailPanelModel } from './DetailPanelModel.ts';

const BOARD = exampleDetailBoard({ tickets: [exampleDetailTicket('012', { task: 9 })], rows: [exampleDetailRow(9, { ticket: '012' })] });

describe('the form a detail opens', () => {
  test('a card opens the ticket form, a row or ticket line the row form', () => {
    expect(DetailPanelModel.detailPanelModelOf(BOARD, { form: 'ticket', ticketId: '012' }, EXAMPLE_DETAIL_FORMAT).form).toBe('ticket');
    expect(DetailPanelModel.detailPanelModelOf(BOARD, { form: 'task-row', taskId: 9 }, EXAMPLE_DETAIL_FORMAT).form).toBe('row');
    expect(DetailPanelModel.detailPanelModelOf(BOARD, { form: 'ticket-row', ticketId: '012' }, EXAMPLE_DETAIL_FORMAT).form).toBe('row');
  });

  test('an item the board does not hold opens one line naming it', () => {
    expect([
      DetailPanelModel.detailPanelModelOf(BOARD, { form: 'ticket', ticketId: '999' }, EXAMPLE_DETAIL_FORMAT),
      DetailPanelModel.detailPanelModelOf(BOARD, { form: 'task-row', taskId: 99 }, EXAMPLE_DETAIL_FORMAT),
      DetailPanelModel.detailPanelModelOf(BOARD, { form: 'draft', draftId: 'D9' }, EXAMPLE_DETAIL_FORMAT),
    ]).toEqual([
      { form: 'missing', text: 'No ticket #999 on this board.' },
      { form: 'missing', text: 'No row 99 on this board.' },
      { form: 'missing', text: 'No open draft D9 on this board.' },
    ]);
  });
});
