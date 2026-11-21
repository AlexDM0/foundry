/**
 * The board after its stream's events and reads. Every event of the relayed stream is a change signal that carries no part of the board:
 * `board-changed` makes the page read the board again, and a part's event alone reads nothing, since the `board-changed` of the same pass
 * follows it. A read board replaces the board whole; a read that failed keeps the board shown, and before the first read there is none.
 */
import type { BoardDocument }      from '../../@types/board/BoardDocument.ts';
import type { BoardEventDocument } from '../../@types/board/BoardEventDocument.ts';
import type { BoardRead }          from '../api/BoardReadClient.ts';

function readIsDueAfter(event: BoardEventDocument): boolean {
  return event.kind === 'board-changed';
}

function boardAfterRead(board: BoardDocument | null, read: BoardRead): BoardDocument | null {
  return read.verdict === 'read' ? read.board : board;
}

export const BoardStateUpdate = Object.freeze({ readIsDueAfter, boardAfterRead });
