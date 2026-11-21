/**
 * An epic's roll-up as the epic marks read it. What matters: the done text counts delivered tickets of all, the card's mark
 * turns to "all settled" or "no tickets" once nothing is open, segments come settled first and skip empty states, the facts list
 * abandoned only when there are any and word the span against today and the moment handed in, and open epics are shown before settled ones.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardEpicDocument } from '../../@types/board/BoardTicketDocuments.ts';
import { ticketCountByStatusOf }  from '../testing/BoardStateFixture.ts';
import { EXAMPLE_PAGE_LIMITS }    from '../testing/TimestampSlicesFixture.ts';
import { EpicRollupUtil }         from './EpicRollupUtil.ts';

const OPEN_EPIC: BoardEpicDocument = {
  key:                 'checkout',
  title:               'Example checkout',
  slot:                1,
  ticketIds:           ['1', '2', '3', '4'],
  ticketCountByStatus: ticketCountByStatusOf({
    'committed': 1, 'abandoned': 1, 'delivered': 1, 'in-review': 1
  }),
  tokens: 3_500_000,
  span:   { start: '2026-10-29T09:15:00', end: null },
};

const SETTLED_EPIC: BoardEpicDocument = {
  ...OPEN_EPIC,
  key:                 'archive',
  ticketIds:           ['5'],
  ticketCountByStatus: ticketCountByStatusOf({ delivered: 1 }),
  tokens:              900,
  span:                { start: '2026-10-20T08:00:00', end: '2026-10-20T10:58:00' },
};

const FORMAT = { limits: EXAMPLE_PAGE_LIMITS, todayCalendarDate: '2026-10-29', nowEpochMilliseconds: new Date('2026-10-29T11:00:00').getTime() };

describe('the done text', () => {
  test('counts the delivered tickets of all, and the card mark settles once nothing is open', () => {
    expect([EpicRollupUtil.doneTextOf(OPEN_EPIC), EpicRollupUtil.settledDoneTextOf(OPEN_EPIC)]).toEqual(['1 of 4 done', '1 of 4 done']);
    expect(EpicRollupUtil.settledDoneTextOf(SETTLED_EPIC)).toBe('all settled');
    expect(EpicRollupUtil.settledDoneTextOf({ ...OPEN_EPIC, ticketIds: [], ticketCountByStatus: ticketCountByStatusOf({}) })).toBe('no tickets');
    expect(EpicRollupUtil.rollupAriaLabelOf(OPEN_EPIC)).toBe('1 of 4 done tickets');
  });
});

describe('the segments and the facts', () => {
  test('segments come settled first, each worded and in its state tone, and skip a state with no ticket', () => {
    expect(EpicRollupUtil.rollupSegmentsOf(OPEN_EPIC)).toEqual([
      {
        state: 'delivered', tone: 'ink', count: 1, label: 'Done'
      },
      {
        state: 'in-review', tone: 'info-outline', count: 1, label: 'Awaiting review'
      },
      {
        state: 'committed', tone: 'neutral', count: 1, label: 'To do'
      },
      {
        state: 'abandoned', tone: 'muted', count: 1, label: 'Abandoned'
      },
    ]);
  });

  test('an open span runs to now; abandoned shows only when there are any', () => {
    expect(EpicRollupUtil.rollupFactsOf(OPEN_EPIC, FORMAT)).toEqual([
      { label: 'open', value: '2', title: null },
      { label: 'done', value: '1', title: null },
      { label: 'abandoned', value: '1', title: null },
      { label: 'tokens', value: '3.5M', title: null },
      { label: 'span', value: '09:15 → now · 1h 45m', title: '2026-10-29 09:15 → still open' },
    ]);
    expect(EpicRollupUtil.rollupFactsOf(SETTLED_EPIC, FORMAT).map((fact) => fact.label)).toEqual(['open', 'done', 'tokens', 'span']);
  });

  test('a closed span dates both ends, and an epic never started says so', () => {
    const closedSpan = EpicRollupUtil.rollupFactsOf(SETTLED_EPIC, FORMAT).at(-1);
    expect([closedSpan?.value, closedSpan?.title]).toEqual(['10-20 08:00 → 10-20 10:58 · 2h 58m', '2026-10-20 08:00 → 2026-10-20 10:58']);
    expect(EpicRollupUtil.rollupFactsOf({ ...OPEN_EPIC, span: null }, FORMAT).at(-1)).toEqual({ label: 'span', value: 'not started', title: null });
  });
});

describe('the shown order', () => {
  test('open epics come before settled ones, each part keeping its order', () => {
    expect(EpicRollupUtil.epicsInShownOrder([SETTLED_EPIC, OPEN_EPIC]).map((epic) => epic.key)).toEqual(['checkout', 'archive']);
  });
});
