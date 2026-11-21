/**
 * Hephaestus kinds of the control contract. Pausing and resuming write the stored drain flag, `hephaestusState`, with Hephaestus up or
 * down; stopping and restarting, Hephaestus or Talos, are runtime only, so applied to the board they are refused rather than mistaken for a change.
 */
import type { ControlCommand }   from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }      from '../../shared/OperationRefusal.ts';
import type { BoardTransaction } from '../tracker/BoardTransaction.ts';

function refuseRuntimeOnly(command: ControlCommand): never {
  throw new OperationRefusal('refused', { kind: 'hephaestus-control-is-runtime-only', commandKind: command.kind });
}

export const HEPHAESTUS_CONTROLS = {
  'hephaestus-pause':        (_command: ControlCommand, change: BoardTransaction) => change.board.setHephaestusState('paused', change.at),
  'hephaestus-unpause':      (_command: ControlCommand, change: BoardTransaction) => change.board.setHephaestusState('running', change.at),
  'hephaestus-stop':         refuseRuntimeOnly,
  'hephaestus-restart':      refuseRuntimeOnly,
  'talos-restart':           refuseRuntimeOnly,
  // The limit lives in the monitor folder, not in a board, so `POST /api/commands` sets it outside any hold.
  'machine-agent-limit-set': refuseRuntimeOnly,
} as const;
