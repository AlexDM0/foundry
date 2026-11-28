/**
 * The by-hand `task` kinds over the Board fixtures. What matters: each kind changes the Board exactly as the `task` verb's own Board calls
 * did, so a twin board given those calls ends equal in its rows, its answer and its log; and a `--ticket` or `--review-of` reference that
 * names no ticket leaves as the wordless `task-ticket-missing`, naming the option, with nothing added.
 */
import { describe, expect, test } from 'bun:test';

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
    tasks: [taskFixture({ id: 1, name: 'Example chore' }), taskFixture({
      id: 2, name: 'Example ticket row', ticket: '003', status: 'in-review'
    })],
    tickets: [ticketFixture({ id: '003', status: 'in-review', task: 2 }), { ...ticketFixture({ id: '004', status: 'in-review' }), body: REVIEWED_BODY }],
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
    name:    'task-add with a ticket, an owner, a note and tokens, started at once',
    command: {
      kind: 'task-add', name: 'Example basket row', ticketReference: '#4', owner: 'Alex Example', note: 'by hand', tokens: 1200, startsNow: true, movesTheLink: false,
    },
    verbBoardCall: (board) => board.addTask({
      name: 'Example basket row', startsNow: true, movesTheLink: false, owner: 'Alex Example', note: 'by hand', tokens: 1200, ticketId: '004',
    }, CHANGED_AT),
  },
  {
    name:    'task-add of a review bar, on the reviewed ticket\'s next round',
    command: {
      kind: 'task-add', name: 'Example review', reviewOfReference: '4', startsNow: false, movesTheLink: false
    },
    verbBoardCall: (board) => board.addTask({
      name: 'Example review', startsNow: false, movesTheLink: false, reviewOf: { ticketId: '004', round: 2 },
    }, CHANGED_AT),
  },
  {
    name:    'task-move, then the annotation',
    command: {
      kind: 'task-move', taskId: 1, status: 'in-progress', movesAnyway: false, annotation: { owner: 'Alex Example', tokens: 300 },
    },
    verbBoardCall: (board) => {
      board.moveTask(1, 'in-progress', { movesAnyway: false }, CHANGED_AT);
      return board.annotateTask(1, { owner: 'Alex Example', tokens: 300 });
    },
  },
  {
    name:    'task-correct of a ticket\'s row with --force, stamping no time',
    command: {
      kind: 'task-correct', taskId: 2, correction: { name: 'Renamed row', status: 'paused' }, movesAnyway: true, annotation: { note: 'fixed by hand' },
    },
    verbBoardCall: (board) => {
      board.correctTask(2, { name: 'Renamed row', status: 'paused' }, { movesAnyway: true });
      return board.annotateTask(2, { note: 'fixed by hand' });
    },
  },
  {
    name:          'task-remove',
    command:       { kind: 'task-remove', taskId: 1 },
    verbBoardCall: (board) => board.removeTask(1),
  },
];

describe('the task kinds', () => {
  test.each(TWIN_CASES.map((twinCase) => [twinCase.name, twinCase] as const))('%s does to the Board what the verb did', (_name, twinCase) => {
    const applied = storefrontFixture();
    const byVerb  = storefrontFixture();

    const result = appliedTo(applied, twinCase.command);
    const answer = twinCase.verbBoardCall(byVerb.board);

    expect(result).toEqual(answer);
    expect(applied.board.tasks()).toEqual(byVerb.board.tasks());
    expect(applied.records).toEqual(byVerb.records);
  });

  test.each([
    ['ticket', {
      kind: 'task-add', name: 'Example row', ticketReference: '9', startsNow: false, movesTheLink: false
    }],
    ['review-of', {
      kind: 'task-add', name: 'Example review', reviewOfReference: '#9', startsNow: false, movesTheLink: false
    }],
  ] as const)('a --%s reference with no ticket is refused task-ticket-missing and adds no row', (option, command) => {
    const fixture = storefrontFixture();
    const reference = option === 'ticket' ? '9' : '#9';

    const refusal = refusalOf(() => appliedTo(fixture, command));

    expect(refusal.status).toBe('refused');
    expect(refusal.detail).toEqual({ kind: 'task-ticket-missing', option, reference });
    expect(fixture.board.tasks()).toHaveLength(2);
  });

  test('a move of a ticket\'s row without --force leaves as the Board\'s own refusal', () => {
    const fixture = storefrontFixture();
    const command: ControlCommand = {
      kind: 'task-move', taskId: 2, status: 'reviewed', movesAnyway: false, annotation: {},
    };
    expect(refusalDetailOf(() => appliedTo(fixture, command)).reason).toBe('ticket-owned-row');
  });
});
