/**
 * Queues a ticket to merge as Hephaestus does after a green gate run: a pipeline stored (no gates when none is), the tree recorded as the
 * row's review-phase green under that pipeline, then the mark. For specs whose subject is what happens after the queuing.
 */
import type { Logged } from '../lib/tracker-model/@types/BoardChanges.ts';
import type { Board }  from '../lib/tracker-model/Board.ts';

/** A synthetic tree OID for specs whose branch tree is never read from git. */
export const EXAMPLE_GREEN_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export function queueOnCurrentGreen(board: Board, ticketId: string, target: string, at: string, tree: string = EXAMPLE_GREEN_TREE): Logged {
  if (board.pipeline() === null) board.setNoGates(at);
  board.recordPipelineJudgedBy(ticketId, tree, board.gateRunStampOf('review'), at);
  return board.queueTicketForMerge(ticketId, target, tree, at);
}
