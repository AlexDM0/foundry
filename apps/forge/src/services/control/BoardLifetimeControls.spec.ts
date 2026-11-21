/**
 * The board's lifetime kinds, applied through the control service to a Board as a hold carries it. What matters: a window is stored
 * as `range` stores it, relative bounds as written and timestamps normalised, read against the hold's own time; an unreadable bound, a
 * backwards pair and a tick that is no whole number of minutes are refused with a wordless detail and leave the axis alone; and a clear is
 * refused while any job but the Assistant is live, since a job would run on against rows, a log and tickets that are gone, and a live
 * Hephaestus always has an Assistant, so it alone must not hold the clear back; otherwise the clear keeps the tickets.
 */
import { describe, expect, test } from 'bun:test';

import { OperationRefusalWordingUtil }                          from '../../adapters/utils/OperationRefusalWordingUtil.ts';
import type { Board }                                           from '../../lib/tracker-model/Board.ts';
import type { ControlCommand }                                  from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal, type OperationRefusalDetail }        from '../../shared/OperationRefusal.ts';
import { boardFixture, ticketFixture }                          from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                               from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import type { BoardTransaction }                                from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                                    from '../tracker/Workspace.ts';
import { ControlService }                                       from './ControlService.ts';

const AT = '2026-09-26T10:15:00+02:00';

function changeOf(board: Board): BoardTransaction {
  // The appliers read the Board, the stamp of the hold, the stored log's length and the data folder; a plain clear deletes no file.
  return {
    board,
    workspace:                      workspacePathsFor('/example-agency/storefront'),
    at:                             AT,
    records:                        createFixtureRecordAllocation(board),
    unreadableRecords:              NO_UNREADABLE_RECORDS,
    storedLogEntryCount:            4,
    deleteAllTicketFilesAfterwards: () => undefined,
  } as unknown as BoardTransaction;
}

function apply(board: Board, command: ControlCommand): unknown {
  return ControlService.apply(command, changeOf(board), ECHOED_CONTROL_CONTEXT).result;
}

function refusalOf(attempt: () => unknown): OperationRefusal {
  try {
    attempt();
  } catch (error) {
    if (error instanceof OperationRefusal) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('chart-range-set', () => {
  test('two relative bounds are stored as written, under the relative kind, with the tick', () => {
    const { board, progress } = boardFixture();
    const result = apply(board, {
      kind:  'chart-range-set',
      range: {
        kind: 'window', from: '-2h', to: 'now', tickMinutes: 15
      }
    });
    expect(progress.view).toEqual({
      kind: 'relative', from: '-2h', to: 'now', tickMinutes: 15
    });
    expect(result).toMatchObject({ view: { kind: 'relative' } });
  });

  test('two timestamps are stored as absolute, and automatic puts the axis back', () => {
    const { board, progress } = boardFixture();
    apply(board, {
      kind:  'chart-range-set',
      range: {
        kind: 'window', from: '2026-09-26T08:00:00+02:00', to: '2026-09-26T12:00:00+02:00', tickMinutes: null
      }
    });
    expect(progress.view).toMatchObject({ kind: 'absolute', tickMinutes: null });
    apply(board, { kind: 'chart-range-set', range: { kind: 'automatic' } });
    expect(progress.view).toEqual({ kind: 'auto' });
  });

  test('an unreadable bound, a backwards pair and a tick of no whole minutes are refused wordless, and the axis stays', () => {
    const { board, progress } = boardFixture();
    const attempts: [ControlCommand, OperationRefusalDetail['kind']][] = [
      [{
        kind:  'chart-range-set',
        range: {
          kind: 'window', from: 'garbage', to: 'now', tickMinutes: null
        }
      }, 'chart-range-bound-unreadable'],
      [{
        kind:  'chart-range-set',
        range: {
          kind: 'window', from: '-1h', to: '-3h', tickMinutes: null
        }
      }, 'chart-range-backwards'],
      [{
        kind:  'chart-range-set',
        range: {
          kind: 'window', from: '-1h', to: 'now', tickMinutes: 0
        }
      }, 'chart-range-tick-unreadable'],
    ];
    for (const [command, reason] of attempts) {
      const refusal = refusalOf(() => apply(board, command));
      expect(refusal.detail?.kind, reason).toBe(reason);
      expect(OperationRefusalWordingUtil.messageOf(refusal), reason).not.toBe('');
    }
    expect(progress.view).toEqual({ kind: 'auto' });
  });
});

describe('tracker-clear', () => {
  test('tasks-and-log keeps the tickets and reports what it removed', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'committed' })] });
    const result = apply(board, { kind: 'tracker-clear', scope: 'tasks-and-log' });
    expect(result).toMatchObject({ removedLogCount: 4, deletedTicketCount: 0, reseededTicketCount: 1 });
    expect(board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
  });

  test('a live job refuses the clear, naming it, and nothing is cleared', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress' })] });
    board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, AT);
    const refusal = refusalOf(() => apply(board, { kind: 'tracker-clear', scope: 'everything' }));
    expect(refusal.detail).toEqual({ kind: 'tracker-has-live-jobs', jobIds: ['J1'] });
    expect(board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
  });

  test('a live Assistant, which a live Hephaestus always has, neither refuses the clear nor is named beside a job that does', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress' })] });
    board.launchJob({
      kind: 'assistant', role: 'assistant', ticketIds: [], parentJobId: null, attempt: 1, target: null
    }, AT);
    expect(apply(board, { kind: 'tracker-clear', scope: 'tasks-and-log' })).toMatchObject({ reseededTicketCount: 1 });
    board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, AT);
    expect(refusalOf(() => apply(board, { kind: 'tracker-clear', scope: 'tasks-and-log' })).detail).toEqual({ kind: 'tracker-has-live-jobs', jobIds: ['J2'] });
  });
});

describe('ticket-deliver-by-hand', () => {
  test('a ticket with no live job is recorded delivered by hand, with its branch', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'committed' })] });
    apply(board, { kind: 'ticket-deliver-by-hand', ticketReference: '#1', branch: 'ticket-001' });
    expect(board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('a live job of the ticket refuses it, naming the job', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress' })] });
    board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, AT);
    const refusal = refusalOf(() => apply(board, { kind: 'ticket-deliver-by-hand', ticketReference: '1' }));
    expect(refusal.detail).toMatchObject({ kind: 'ticket-has-live-job', ticketId: '001', jobId: 'J1' });
    expect(board.tickets()[0]?.frontmatter.status).toBe('in-progress');
  });
});
