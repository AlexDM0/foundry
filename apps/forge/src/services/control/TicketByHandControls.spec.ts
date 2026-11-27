/**
 * The by-hand ticket kinds over the Board fixtures. What matters: each kind changes the Board exactly as the `ticket` verb's own Board calls
 * did, so a twin board given those calls ends equal in its tickets, its rows, its answer and its log; a reference that names no ticket leaves
 * as the wordless `no-readable-ticket` with nothing changed; `ticket-reopen` keeps the legality matrix and `ticket-status-set` skips it.
 */
import { describe, expect, test } from 'bun:test';

import { TicketBodyUtil }      from '../../adapters/utils/TicketBodyUtil.ts';
import type { Board }          from '../../domain/tracker-model/Board.ts';
import type { ControlCommand } from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }    from '../../shared/OperationRefusal.ts';
import {
  boardFixture,
  refusalDetailOf,
  taskFixture,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import type { BoardFixture }                                    from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                               from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import type { BoardTransaction }                                from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                                    from '../tracker/Workspace.ts';
import { ControlService }                                       from './ControlService.ts';

const CHANGED_AT = '2026-11-20T10:00:00+01:00';

const REVIEWED_BODY = '## Brief\nWork in the basket page.\n\n## Review\nAlex Example asked for a total.\n';

function storefrontFixture(): BoardFixture {
  return boardFixture({
    tasks:   [taskFixture({ id: 1, name: 'Example chore' })],
    tickets: [
      ticketFixture({ id: '003', status: 'committed', group: 'checkout' }),
      { ...ticketFixture({ id: '004', status: 'in-review' }), body: REVIEWED_BODY },
      ticketFixture({ id: '005', status: 'delivered' }),
      ticketFixture({ id: '006', type: 'bug', status: 'committed' }),
    ],
  });
}

function changeOf(board: Board): BoardTransaction {
  return {
    board,
    workspace:                      workspacePathsFor('/example-agency/storefront'),
    at:                             CHANGED_AT,
    records:                        createFixtureRecordAllocation(board),
    unreadableRecords:              NO_UNREADABLE_RECORDS,
    unreadablePipeline:             null,
    storedLogEntryCount:            0,
    storedLogRecords:               [],
    deleteAllTicketFilesAfterwards: () => undefined,
  };
}

function appliedTo(fixture: BoardFixture, command: ControlCommand): unknown {
  return ControlService.apply(command, changeOf(fixture.board), ECHOED_CONTROL_CONTEXT).result;
}

function refusalOf(attempt: () => unknown): OperationRefusal {
  try {
    attempt();
  } catch (error) {
    if (error instanceof OperationRefusal) return error;
    throw error;
  }
  throw new Error('the command was not refused');
}

interface TwinCase {
  name:          string;
  command:       ControlCommand;
  verbBoardCall: (board: Board) => unknown;
}

const TWIN_CASES: readonly TwinCase[] = [
  {
    name:    'ticket-link',
    command: {
      kind: 'ticket-link', ticketReference: '#3', taskId: 1, movesTheLink: false
    },
    verbBoardCall: (board) => board.linkTicketToTask('003', 1, { movesTheLink: false }),
  },
  {
    name:          'ticket-size',
    command:       { kind: 'ticket-size', ticketReference: '3', size: 'L' },
    verbBoardCall: (board) => board.setTicketSize('003', 'L', CHANGED_AT),
  },
  {
    name:    'ticket-agent with a model and an effort',
    command: {
      kind: 'ticket-agent', ticketReference: '003', model: 'opus', effort: 'high'
    },
    verbBoardCall: (board) => board.setTicketAgents('003', { model: 'opus', effort: 'high' }, CHANGED_AT),
  },
  {
    name:          'ticket-agent with an effort alone',
    command:       { kind: 'ticket-agent', ticketReference: '3', effort: 'low' },
    verbBoardCall: (board) => board.setTicketAgents('003', { effort: 'low' }, CHANGED_AT),
  },
  {
    name:          'ticket-introduced-by naming the cause',
    command:       { kind: 'ticket-introduced-by', ticketReference: '6', causeTicketId: '005' },
    verbBoardCall: (board) => board.setTicketIntroducedBy('006', '005', CHANGED_AT),
  },
  {
    name:          'ticket-release-of marking the release ticket',
    command:       { kind: 'ticket-release-of', ticketReference: '3', clears: false },
    verbBoardCall: (board) => board.markReleaseTicket('003', CHANGED_AT),
  },
  {
    name:          'ticket-rereview with a review bar, on the next round',
    command:       { kind: 'ticket-rereview', ticketReference: '4', reviewBar: { owner: 'Alex Example', note: 'Second look' } },
    verbBoardCall: (board) => {
      const rereview = board.rereviewTicket('004', CHANGED_AT);
      const round    = TicketBodyUtil.nextReviewRoundOf(rereview.ticket.body);
      return { rereview, startedReviewBar: board.startReviewBar('004', { round, owner: 'Alex Example', note: 'Second look' }, CHANGED_AT) };
    },
  },
  {
    name:          'ticket-rereview without a review bar',
    command:       { kind: 'ticket-rereview', ticketReference: '4', reviewBar: null },
    verbBoardCall: (board) => ({ rereview: board.rereviewTicket('004', CHANGED_AT), startedReviewBar: null }),
  },
  {
    name:    'ticket-reopen of a delivered ticket, with a reason and tokens',
    command: {
      kind: 'ticket-reopen', ticketReference: '5', reason: 'The basket total is wrong', tokens: 400
    },
    verbBoardCall: (board) => board.moveTicket('005', 'committed', { checksLegality: true, reason: 'The basket total is wrong', tokens: 400 }, CHANGED_AT),
  },
  {
    name:    'ticket-status-set past the legality matrix',
    command: {
      kind: 'ticket-status-set', ticketReference: '3', status: 'reviewed', branch: 'ticket-003', commit: 'abc1234'
    },
    verbBoardCall: (board) => board.moveTicket('003', 'reviewed', { checksLegality: false, branch: 'ticket-003', commit: 'abc1234' }, CHANGED_AT),
  },
  {
    name:          'ticket-unready of a committed ticket no job has taken',
    command:       { kind: 'ticket-unready', ticketReference: '6' },
    verbBoardCall: (board) => board.unreadyTicket('006', CHANGED_AT),
  },
];

describe('the by-hand ticket kinds', () => {
  test.each(TWIN_CASES.map((twinCase) => [twinCase.name, twinCase] as const))('%s does to the Board what the verb did', (_name, twinCase) => {
    const applied = storefrontFixture();
    const byVerb  = storefrontFixture();

    const result = appliedTo(applied, twinCase.command);
    const answer = twinCase.verbBoardCall(byVerb.board);

    expect(result).toEqual(answer);
    expect(applied.board.tickets()).toEqual(byVerb.board.tickets());
    expect(applied.board.tasks()).toEqual(byVerb.board.tasks());
    expect(applied.records).toEqual(byVerb.records);
  });

  test('ticket-release-of with clears removes the mark it set', () => {
    const fixture = storefrontFixture();
    appliedTo(fixture, { kind: 'ticket-release-of', ticketReference: '3', clears: false });
    const twin = storefrontFixture();
    twin.board.markReleaseTicket('003', CHANGED_AT);

    expect(appliedTo(fixture, { kind: 'ticket-release-of', ticketReference: '3', clears: true })).toEqual(twin.board.clearReleaseTicket('003', CHANGED_AT));
    expect(fixture.board.tickets()).toEqual(twin.board.tickets());
  });

  test('ticket-introduced-by with no cause clears the one named', () => {
    const fixture = storefrontFixture();
    appliedTo(fixture, { kind: 'ticket-introduced-by', ticketReference: '6', causeTicketId: '005' });

    appliedTo(fixture, { kind: 'ticket-introduced-by', ticketReference: '6', causeTicketId: null });

    expect(fixture.board.ticketByReference('6')?.frontmatter.introducedBy).toBeUndefined();
  });

  test('ticket-reopen keeps the legality matrix: a ticket already committed is refused by the Board', () => {
    const fixture = storefrontFixture();
    const before  = fixture.board.tickets();

    expect(refusalDetailOf(() => appliedTo(fixture, { kind: 'ticket-reopen', ticketReference: '3' })).reason).toBeString();
    expect(fixture.board.tickets()).toEqual(before);
  });

  test.each([
    {
      kind: 'ticket-link', ticketReference: '9', taskId: 1, movesTheLink: false
    },
    { kind: 'ticket-size', ticketReference: '9', size: 'S' },
    { kind: 'ticket-agent', ticketReference: '9', model: 'opus' },
    { kind: 'ticket-introduced-by', ticketReference: '9', causeTicketId: null },
    { kind: 'ticket-release-of', ticketReference: '9', clears: false },
    { kind: 'ticket-rereview', ticketReference: '9', reviewBar: null },
    { kind: 'ticket-reopen', ticketReference: '9' },
    { kind: 'ticket-status-set', ticketReference: '9', status: 'abandoned' },
    { kind: 'ticket-unready', ticketReference: '9' },
  ] satisfies ControlCommand[] as ControlCommand[])('$kind of a reference with no ticket is refused no-readable-ticket and changes nothing', (command) => {
    const fixture = storefrontFixture();
    const before  = fixture.board.tickets();

    const refusal = refusalOf(() => appliedTo(fixture, command));

    expect(refusal.status).toBe('refused');
    expect(refusal.detail).toEqual({ kind: 'no-readable-ticket', reference: '9' });
    expect(fixture.board.tickets()).toEqual(before);
  });
});
