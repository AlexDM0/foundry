/**
 * What waits on User. What matters: each of the six kinds comes from its own source, and only that source; a decision is escalated only
 * when an `incident-escalated` record names it; the escalated items lead, then everything else oldest first across kinds, a tie in key
 * order, so the order needs no clock; each row's action opens its place; the tab counts tone Questions by escalation, sum the four Kanban
 * kinds, count the Assistant's open incidents in grey, give no entry at zero and never count Intake; the accessible names read singular and
 * plural; and a board missing its optional slices counts them as empty.
 */
import { describe, expect, test } from 'bun:test';

import {
  AGENT_DECISION,
  nothingWaitingBoard,
  waitingOnUserBoard,
  WAITING_TICKETS,
  type WaitingOnUserFixtureBoard
} from '../testing/WaitingOnUserFixture.ts';
import { WaitingOnUserModel, type WaitingOnUser } from './WaitingOnUserModel.ts';

const { waitingOnUserOf, tabCountsOf, pillAriaLabelOf } = WaitingOnUserModel;

function keysOf(waiting: WaitingOnUser): { escalated: string[]; byAge: string[] } {
  return { escalated: waiting.escalated.map((item) => item.key), byAge: waiting.byAge.map((item) => item.key) };
}

describe('the six kinds', () => {
  test('each kind comes from its source, with its id, subject, stamp and the action that opens its place', () => {
    const waiting = waitingOnUserOf(waitingOnUserBoard());
    const rows = [...waiting.escalated, ...waiting.byAge].map((item) => [item.kind, item.idText, item.subject, item.stamp, item.action.label, item.action.href]);
    expect(rows).toEqual([
      ['escalated-question', 'E3', 'Example rate-limit window: per customer or per address?', '2026-11-09T14:19:40', 'Answer', '#questions'],
      ['filing-draft', 'D2', 'Example filing draft', '2026-11-09T09:30:00', 'Answer', '#kanban/draft/D2'],
      ['question', 'E2', 'Example worktree left on a branch', '2026-11-09T10:58:00', 'Answer', '#questions'],
      ['draft-ticket', '#009', 'Example dates in the shop time zone', '2026-11-09T11:52:00', 'Ready', '#kanban/ticket/009'],
      ['review', '#006', 'Example review ready', '2026-11-09T12:00:00', 'Review', '#kanban/ticket/006'],
      ['merge-accept', '#005', 'Example reviewed change', '2026-11-09T13:00:00', 'Accept', '#kanban/ticket/005'],
      ['draft-ticket', '#015', 'Example search suggestions', '2026-11-09T13:31:00', 'Ready', '#kanban/ticket/015'],
      ['question', 'E4', 'Example table rows: zebra or dividers?', '2026-11-09T14:19:55', 'Answer', '#questions'],
    ]);
  });

  test('a decision is escalated only when an incident-escalated record names it, and then names that incident and leads with its action', () => {
    const waiting = waitingOnUserOf(waitingOnUserBoard());
    expect(waiting.escalated.map((item) => [item.idText, item.escalatedFromIncidentId, item.action.primary])).toEqual([['E3', 'I2', true]]);
    expect(waiting.byAge.every((item) => item.escalatedFromIncidentId === null && !item.action.primary)).toBe(true);
    const unescalated = waitingOnUserOf(waitingOnUserBoard({ questionHistory: [{ kind: 'incident-defaulted', at: '2026-11-09T14:00:00', fields: { decisionId: 'E3' } }] }));
    expect(unescalated.escalated).toEqual([]);
  });

  test('a decision names its asker and job, and its kind only when Overseer code opened it', () => {
    const waiting = waitingOnUserOf(waitingOnUserBoard());
    const decisions = waiting.byAge.filter((item) => item.kind === 'question').map((item) => [item.idText, item.decisionKind, item.askedBy, item.jobId, item.ticketIds]);
    expect(decisions).toEqual([['E2', 'leftover-worktree', 'overseer', null, ['002']], ['E4', null, 'builder', 'J4', ['004']]]);
  });

  test('a filing draft counts only while it waits on an answer, and a ticket only as a draft, ready for review or waiting for the merge accept', () => {
    const waiting = waitingOnUserOf(waitingOnUserBoard());
    const keys = waiting.byAge.map((item) => item.key);
    expect(keys).not.toContain('draft:D3');
    expect(keys).not.toContain('ticket:010');
    expect(waiting.byAge.find((item) => item.key === 'merge-accept:005')?.metaText).toBe('reviewed, waits for User\'s accept on main');
    expect(waiting.byAge.find((item) => item.key === 'draft:D2')?.metaText).toBe('Waiting on you · 2 open questions');
  });

  test('a draft ticket counts from its filing stamp, and from its last update on a board that serves none', () => {
    const board = nothingWaitingBoard();
    const { page } = board;
    if (page === undefined) throw new Error('the waiting board serves no page');
    const filed = {
      id: '020', title: 'Example filed draft', status: 'draft', filed: '2026-11-09T07:00:00', updated: '2026-11-09T08:00:00', delivered: null, abandonedAt: null,
    };
    const { filed: _filed, ...unfiled } = { ...filed, id: '021' };
    const waiting = waitingOnUserOf({ ...board, page: { ...page, tickets: [filed, unfiled] } });
    expect(waiting.byAge.map((item) => [item.key, item.stamp])).toEqual([['ticket:020', '2026-11-09T07:00:00'], ['ticket:021', '2026-11-09T08:00:00']]);
  });
});

describe('the order and the totals', () => {
  test('the escalated lead oldest first, then the rest oldest first across kinds, reproducing the board: E3, then E2, #009, #015, E4', () => {
    const board = waitingOnUserBoard({ mergeQueue: { targets: [] } });
    const { page } = board;
    if (page === undefined) throw new Error('the waiting board serves no page');
    const waiting = waitingOnUserOf({
      ...board,
      page: {
        ...page,
        tickets: WAITING_TICKETS.filter((ticket) => ticket.status === 'draft'),
        payload: { ...page.payload, boardFacts: { ...page.payload.boardFacts, drafts: [] } },
      },
    });
    expect(keysOf(waiting)).toEqual({ escalated: ['decision:E3'], byAge: ['decision:E2', 'ticket:009', 'ticket:015', 'decision:E4'] });
  });

  test('items stamped alike keep their key order', () => {
    const twin = { ...AGENT_DECISION, id: 'E1' };
    const waiting = waitingOnUserOf({ ...nothingWaitingBoard(), decisions: [AGENT_DECISION, twin] });
    expect(waiting.byAge.map((item) => item.key)).toEqual(['decision:E1', 'decision:E4']);
  });

  test('the total and the escalated count, and a board where nothing waits counts none', () => {
    const waiting = waitingOnUserOf(waitingOnUserBoard());
    expect([waiting.total, waiting.escalatedCount]).toEqual([8, 1]);
    const nothing = waitingOnUserOf(nothingWaitingBoard());
    expect([nothing.total, nothing.escalatedCount, nothing.escalated, nothing.byAge]).toEqual([0, 0, [], []]);
  });

  test('a board missing its page, log, merge queue and drafts counts them as empty and never throws', () => {
    const {
      page: _page, questionHistory: _history, mergeQueue: _queue, ...bare
    } = waitingOnUserBoard();
    const waiting = waitingOnUserOf(bare);
    expect([waiting.total, waiting.escalatedCount]).toEqual([3, 0]);
    const board = waitingOnUserBoard();
    const { page } = board;
    if (page === undefined) throw new Error('the waiting board serves no page');
    const { drafts: _drafts, ...boardFacts } = page.payload.boardFacts;
    const withoutDrafts: WaitingOnUserFixtureBoard = { ...board, page: { ...page, payload: { ...page.payload, boardFacts } } };
    expect(waitingOnUserOf(withoutDrafts).total).toBe(7);
  });
});

describe('the tab counts and the accessible names', () => {
  test('Questions is escalated while any open decision is, Kanban sums its four kinds, and the Assistant counts its incidents in grey', () => {
    const board = waitingOnUserBoard();
    expect(tabCountsOf(board, waitingOnUserOf(board))).toEqual({
      questions: { count: 3, tone: 'escalated', ariaLabel: 'Questions, 3 questions wait on User, 1 escalated' },
      kanban:    { count: 5, tone: 'waiting', ariaLabel: 'Kanban, 5 wait on User' },
      assistant: { count: 1, tone: 'neutral', ariaLabel: 'Assistant, 1 incident the Assistant is settling' },
    });
  });

  test('with nothing escalated Questions waits in rose, one item reads singular, and a zero count gives no entry; Intake never gets one', () => {
    const board = waitingOnUserBoard({ decisions: [AGENT_DECISION], questionHistory: [], incidents: [] });
    const counts = tabCountsOf(board, waitingOnUserOf(board));
    expect(counts.questions).toEqual({ count: 1, tone: 'waiting', ariaLabel: 'Questions, 1 question waits on User' });
    expect([counts.assistant, counts.intake]).toEqual([undefined, undefined]);
    const nothing = nothingWaitingBoard();
    expect(tabCountsOf(nothing, waitingOnUserOf(nothing))).toEqual({});
  });

  test('the pill names the total and the escalated, and none when nothing waits', () => {
    expect(pillAriaLabelOf(waitingOnUserOf(waitingOnUserBoard()))).toBe('Waiting on User: 8, 1 escalated');
    expect(pillAriaLabelOf(waitingOnUserOf(waitingOnUserBoard({ questionHistory: [] })))).toBe('Waiting on User: 8');
    expect(pillAriaLabelOf(waitingOnUserOf(nothingWaitingBoard()))).toBe('Waiting on User: none');
  });
});
