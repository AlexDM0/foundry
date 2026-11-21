/**
 * Today's figures. What matters: a ticket counts as delivered today only when its stamp's calendar date is today's, sliced as written; the
 * tokens count every row still running and every row that ended today, never one that ended on another day; a board without a page has none.
 */
import { describe, expect, test } from 'bun:test';

import { todayFiguresOf, type TodayFiguresBoard } from './TodayFigures.ts';

const TODAY = '2026-11-12';

const BOARD: TodayFiguresBoard = {
  page: {
    tickets: [{ delivered: '2026-11-12T09:00:00+01:00' }, { delivered: '2026-11-11T23:59:00+01:00' }, { delivered: null }],
    payload: {
      progress: {
        tasks: [
          { status: 'in-progress', end: null, tokens: 1000 },
          { status: 'done', end: '2026-11-12T08:00:00+01:00', tokens: 200 },
          { status: 'done', end: '2026-11-11T08:00:00+01:00', tokens: 30 },
          { status: 'done', end: '2026-11-12T10:00:00+01:00' },
        ],
      },
    },
  },
};

describe('todayFiguresOf', () => {
  test('counts the tickets delivered today and the tokens of the rows running or ended today', () => {
    expect(todayFiguresOf(BOARD, TODAY)).toEqual({ deliveredTickets: 1, tokens: 1200 });
  });

  test('a board without a page has delivered nothing and spent nothing', () => {
    expect(todayFiguresOf({}, TODAY)).toEqual({ deliveredTickets: 0, tokens: 0 });
  });
});
