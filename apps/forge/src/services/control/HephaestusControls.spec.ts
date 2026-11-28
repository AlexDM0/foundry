/**
 * Hephaestus kinds of the control contract, applied through the control service to a Board as a hold carries it. What matters: pausing and
 * resuming write the stored drain flag, while stopping or restarting Hephaestus, restarting Talos and setting the machine's agent limit
 * are runtime only, so applied to the board each is refused `hephaestus-control-is-runtime-only` naming its kind and leaves the flag alone.
 */
import { describe, expect, test } from 'bun:test';

import type { Board }                                           from '../../domain/tracker-model/Board.ts';
import type { ControlCommand }                                  from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                                     from '../../shared/OperationRefusal.ts';
import { boardFixture }                                         from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                               from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import type { BoardTransaction }                                from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                                    from '../tracker/Workspace.ts';
import { ControlService }                                       from './ControlService.ts';

const AT = '2026-11-21T09:30:00+01:00';

function changeOf(board: Board): BoardTransaction {
  // Hephaestus appliers read only the Board and the stamp of the hold.
  return {
    board,
    workspace:                      workspacePathsFor('/example-agency/storefront'),
    at:                             AT,
    records:                        createFixtureRecordAllocation(board),
    unreadableRecords:              NO_UNREADABLE_RECORDS,
    storedLogEntryCount:            0,
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

const RUNTIME_ONLY_COMMANDS: readonly ControlCommand[] = [
  { kind: 'hephaestus-stop', now: false },
  { kind: 'hephaestus-restart', now: true },
  { kind: 'talos-restart' },
  { kind: 'machine-agent-limit-set', limit: 4 },
];

describe('Hephaestus kinds applied to the board', () => {
  test('pausing and resuming write the stored drain flag', () => {
    const { board } = boardFixture();
    apply(board, { kind: 'hephaestus-pause' });
    expect(board.hephaestusState()).toBe('paused');
    apply(board, { kind: 'hephaestus-unpause' });
    expect(board.hephaestusState()).toBe('running');
  });

  test.each(RUNTIME_ONLY_COMMANDS.map((command) => [command.kind, command] as const))(
    '%s is runtime only: refused naming its kind, the drain flag left alone',
    (commandKind, command) => {
      const { board } = boardFixture();
      apply(board, { kind: 'hephaestus-unpause' });
      const refusal = refusalOf(() => apply(board, command));
      expect(refusal.status).toBe('refused');
      expect(refusal.detail).toEqual({ kind: 'hephaestus-control-is-runtime-only', commandKind });
      expect(board.hephaestusState()).toBe('running');
    },
  );
});
