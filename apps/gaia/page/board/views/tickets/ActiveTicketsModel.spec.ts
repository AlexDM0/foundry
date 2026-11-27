/**
 * The Active segment's model: each ticket's stage, agent and since, the order of the rows, a document agent's question left to its draft, and the
 * search.
 */
import { describe, expect, test } from 'bun:test';

import type { RowMoment }                                                     from '../../shared/tickets/TicketRowFactsUtil.ts';
import { exampleAgentJob, exampleAskingDecision, FIXTURE_NOW }                from '../../testing/BoardStateFixture.ts';
import { EXAMPLE_BOARD_LIMITS }                                               from '../../testing/PageLimitsFixture.ts';
import { exampleDocumentQuestion, exampleTicketsBoard, exampleTicketsTicket } from '../../testing/TicketsBoardFixture.ts';
import { ActiveTicketsModelUtil }                                             from './ActiveTicketsModel.ts';

const MOMENT: RowMoment = { nowEpochMilliseconds: FIXTURE_NOW.getTime(), slices: EXAMPLE_BOARD_LIMITS };

const BOARD = exampleTicketsBoard({
  tickets: [
    exampleTicketsTicket('18', { title: 'Stock alerts by email', updated: '2026-10-29T10:31:00' }),
    exampleTicketsTicket('16', { title: 'Recently viewed products', updated: '2026-10-29T09:40:00', epics: ['checkout'] }),
    exampleTicketsTicket('14', { title: 'Password reset flow', status: 'in-progress' }),
    exampleTicketsTicket('12', { title: 'Checkout address form', status: 'in-progress' }),
    exampleTicketsTicket('11', { title: 'Cart badge count', status: 'in-review' }),
    exampleTicketsTicket('9', { title: 'Old draft', status: 'draft' }),
    exampleTicketsTicket('8', { title: 'Shipped', status: 'delivered' }),
  ],
  displayStates: { 11: 'reviewing' },
  waitingOn:     { 18: ['12'] },
  jobs:          [
    exampleAgentJob({
      id: 'J2', ticketIds: ['12'], launchedAt: '2026-10-29T11:47:56', live: { ...exampleAgentJob({ id: 'J2' }).live, tokens: 84_000 }
    }),
    exampleAgentJob({ id: 'J3', ticketIds: ['14'], state: 'waiting-for-answer' }),
    exampleAgentJob({
      id: 'J6', kind: 'review', role: 'reviewer', ticketIds: ['11'], launchedAt: '2026-10-29T11:53:38', live: { ...exampleAgentJob({ id: 'J6' }).live, tokens: 33_000 }
    }),
  ],
  decisions: [
    exampleAskingDecision({
      id: 'E2', jobId: 'J3', ticketIds: ['14'], openedAt: '2026-10-29T11:56:00'
    }),
    exampleDocumentQuestion('E9', '16', 'spec', '2026-10-29T11:56:00'),
  ],
});

const MODEL = ActiveTicketsModelUtil.activeTicketsModelOf(BOARD, MOMENT, '');

describe('the stage table', () => {
  test('holds the committed to merged tickets, work under way first, each part by id', () => {
    expect([MODEL.rows.map((row) => row.idText), MODEL.count]).toEqual([['#11', '#12', '#14', '#16', '#18'], 5]);
  });

  test('a row\'s stage is its question, the ticket it waits on, or its display state', () => {
    expect(MODEL.rows.map((row) => [row.stage.label, row.stage.state])).toEqual([
      ['Reviewing', 'reviewing'],
      ['In progress', 'in-progress'],
      ['Asks E2', 'ready-for-review'],
      ['To do', 'committed'],
      ['Waits on #12', 'committed'],
    ]);
  });

  test('a row\'s agent names its job, role and tokens, says when it asks, and says when there is none', () => {
    expect(MODEL.rows.map((row) => row.agent.text)).toEqual(['J6 reviewer · 33k tokens', 'J2 builder · 84k tokens', 'J3 builder asks you', 'no agent yet', 'no agent yet']);
  });

  test('since reads as the job\'s run, the question\'s age or when the ticket became ready', () => {
    expect(MODEL.rows.map((row) => row.sinceText)).toEqual(['6m 22s', '12m 04s', 'asked 4m', 'ready 09:40', 'ready 10:31']);
  });

  test('a reviewer\'s dot is teal, a builder\'s orange, both pulsing, and an asking agent\'s dashed and still', () => {
    expect(MODEL.rows.slice(0, 3).map((row) => [row.agent.dotState, row.agent.pulsing])).toEqual([['reviewing', true], ['in-progress', true], ['ready-for-review', false]]);
  });
});

test('a search narrows the rows by id or words while the count keeps every ticket', () => {
  const searched = ActiveTicketsModelUtil.activeTicketsModelOf(BOARD, MOMENT, 'example checkout');
  expect([searched.rows.map((row) => row.idText), searched.count]).toEqual([['#16'], 5]);
});
