/**
 * What the Tickets rows say alike. What matters: a ticket's primary epic is the first of its epics the board knows; its live job is never
 * an intake's session; a role reads in words; a wait reads as its age under an hour and as its stamp from then on; a run reads to the
 * second; a stamp of the viewer's day reads "today"; and an unreadable stamp shows nothing rather than a wrong time.
 */
import { describe, expect, test } from 'bun:test';

import { exampleAgentJob, FIXTURE_NOW }       from '../../testing/BoardStateFixture.ts';
import { productOwnerJob }                    from '../../testing/IntakeBoardFixture.ts';
import { EXAMPLE_BOARD_LIMITS }               from '../../testing/PageLimitsFixture.ts';
import { TicketRowFactsUtil, type RowMoment } from './TicketRowFactsUtil.ts';

const MOMENT: RowMoment = { nowEpochMilliseconds: FIXTURE_NOW.getTime(), slices: EXAMPLE_BOARD_LIMITS };

const EPICS = [
  {
    key: 'billing', title: 'Example billing', slot: 4, ticketIds: [], ticketCountByStatus: {} as never, tokens: 0, span: null
  },
];

describe('a row\'s epic and agent', () => {
  test('the primary epic is the first of the ticket\'s epics the board knows', () => {
    expect([TicketRowFactsUtil.primaryEpicOf({ epics: ['gone', 'billing'] }, EPICS), TicketRowFactsUtil.primaryEpicOf({ epics: ['gone'] }, EPICS)])
      .toEqual([{ title: 'Example billing', slot: 4 }, null]);
  });

  test('a ticket\'s live job is never an intake\'s session that names it', () => {
    const intake = productOwnerJob({
      id: 'J8', state: 'running', intake: null, ticketIds: ['5']
    });
    const builder = exampleAgentJob({ id: 'J2', ticketIds: ['5'] });
    expect([TicketRowFactsUtil.liveJobOf({ jobs: [intake, builder] }, '5')?.id, TicketRowFactsUtil.liveJobOf({ jobs: [intake] }, '5')]).toEqual(['J2', null]);
  });

  test('a role reads in words, a job with none by its kind, and a review looks teal', () => {
    expect([TicketRowFactsUtil.roleWordOf('plan-agent', 'document-agent'), TicketRowFactsUtil.roleWordOf(null, 'merge'), TicketRowFactsUtil.workingDotStateOf('re-reviewer')])
      .toEqual(['plan agent', 'merge', 'reviewing']);
  });
});

describe('a row\'s stamps', () => {
  test('a wait reads as its age under an hour and as its stamp from then on', () => {
    expect([TicketRowFactsUtil.waitedTextOf('2026-10-29T11:54:00', MOMENT), TicketRowFactsUtil.waitedTextOf('2026-10-29T10:05:00', MOMENT)]).toEqual(['6m', '10:05']);
  });

  test('a run reads to the second, and an age in its two largest units', () => {
    expect([TicketRowFactsUtil.runningTextOf('2026-10-29T11:55:48', MOMENT), TicketRowFactsUtil.ageTextOf('2026-10-29T09:46:00', MOMENT)]).toEqual(['4m 12s', '2h 14m']);
  });

  test('a stamp of the viewer\'s day reads today, another day its month and day', () => {
    expect([TicketRowFactsUtil.dayStampTextOf('2026-10-29T11:05:00', MOMENT), TicketRowFactsUtil.dayStampTextOf('2026-10-28T16:20:00', MOMENT)])
      .toEqual(['today 11:05', '10-28 16:20']);
  });

  test('an unreadable or missing stamp shows nothing', () => {
    expect([TicketRowFactsUtil.waitedTextOf(null, MOMENT), TicketRowFactsUtil.waitedTextOf('not a stamp', MOMENT), TicketRowFactsUtil.runningTextOf(null, MOMENT)])
      .toEqual([null, null, null]);
  });
});
