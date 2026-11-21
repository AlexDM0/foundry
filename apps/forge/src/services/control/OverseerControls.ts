/**
 * The Overseer kinds of the control contract. Pausing and resuming write the stored drain flag, `overseerState`, with the Overseer up or
 * down; stopping and restarting, the Overseer or Talos, are runtime only, so applied to the board they are refused rather than mistaken for a change.
 */
import type { ControlCommand }   from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }      from '../../shared/OperationRefusal.ts';
import type { BoardTransaction } from '../tracker/BoardTransaction.ts';

function refuseRuntimeOnly(command: ControlCommand): never {
  throw new OperationRefusal('refused', { kind: 'overseer-control-is-runtime-only', commandKind: command.kind });
}

export const OVERSEER_CONTROLS = {
  'overseer-pause':          (_command: ControlCommand, change: BoardTransaction) => change.board.setOverseerState('paused', change.at),
  'overseer-resume':         (_command: ControlCommand, change: BoardTransaction) => change.board.setOverseerState('running', change.at),
  'overseer-stop':           refuseRuntimeOnly,
  'overseer-restart':        refuseRuntimeOnly,
  'talos-restart':           refuseRuntimeOnly,
  // The limit lives in the monitor folder, not in a board, so `POST /api/commands` sets it outside any hold.
  'machine-agent-limit-set': refuseRuntimeOnly,
} as const;
