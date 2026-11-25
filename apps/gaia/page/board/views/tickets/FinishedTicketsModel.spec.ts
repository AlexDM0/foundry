/**
 * The Finished segment's model. What matters: the window lets through the latest closed tickets, latest first, and counts the earlier
 * ones it hides; each row names its outcome and when it landed, "today" for the viewer's day; and a search looks through every finished
 * ticket, the window aside, hiding none.
 */
import { describe, expect, test } from 'bun:test';

import { FIXTURE_NOW }                               from '../../testing/BoardStateFixture.ts';
import { EXAMPLE_BOARD_LIMITS }                      from '../../testing/PageLimitsFixture.ts';
import { exampleTicketsBoard, exampleTicketsTicket } from '../../testing/TicketsBoardFixture.ts';
import { FinishedTicketsModelUtil }                  from './FinishedTicketsModel.ts';
import type { RowMoment }                            from './TicketRowFactsUtil.ts';

const MOMENT: RowMoment = { nowEpochMilliseconds: FIXTURE_NOW.getTime(), slices: EXAMPLE_BOARD_LIMITS };

const LAST_DAY_CUTOFF = FIXTURE_NOW.getTime() - 86_400_000;

const BOARD = exampleTicketsBoard({
  tickets: [
    exampleTicketsTicket('10', {
      title: 'Wishlist sharing', status: 'delivered', delivered: '2026-10-29T11:05:00', epics: ['billing']
    }),
    exampleTicketsTicket('7', { title: 'Newsletter sign-up', status: 'abandoned', abandonedAt: '2026-10-28T16:20:00' }),
    exampleTicketsTicket('9', { title: 'Guest checkout', status: 'delivered', delivered: '2026-10-29T10:02:00' }),
    exampleTicketsTicket('3', { title: 'Size guide modal', status: 'delivered', delivered: '2026-10-20T10:00:00' }),
    exampleTicketsTicket('12', { title: 'Still building', status: 'in-progress' }),
  ],
});

describe('the history', () => {
  const model = FinishedTicketsModelUtil.finishedTicketsModelOf(BOARD, MOMENT, LAST_DAY_CUTOFF, '');

  test('shows the tickets the window lets through, latest closed first, and counts the earlier ones', () => {
    expect([model.rows.map((row) => row.idText), model.earlierCount, model.count]).toEqual([['#10', '#9', '#7'], 1, 4]);
  });

  test('each row names its outcome, its epic and when it landed, today\'s with the word today', () => {
    expect(model.rows.map((row) => [row.outcomeLabel, row.epic?.title ?? null, row.landedText])).toEqual([
      ['Done', 'Example billing', 'today 11:05'],
      ['Done', null, 'today 10:02'],
      ['Abandoned', null, '10-28 16:20'],
    ]);
  });
});

test('a search looks through every finished ticket and hides none', () => {
  const searched = FinishedTicketsModelUtil.finishedTicketsModelOf(BOARD, MOMENT, LAST_DAY_CUTOFF, 'size guide');
  expect([searched.rows.map((row) => row.idText), searched.earlierCount]).toEqual([['#3'], 0]);
});
