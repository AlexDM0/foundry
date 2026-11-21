/**
 * The board after an event or a read. What matters: only `board-changed` makes the page read the board again, a part's event never does;
 * a read board replaces the board whole, also before the first; a read that failed, whatever the reason, keeps the board shown.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDocument }      from '../../@types/board/BoardDocument.ts';
import type { BoardEventDocument } from '../../@types/board/BoardEventDocument.ts';
import { BOARD_PART_NAMES }        from '../../@types/board/BoardEventDocument.ts';
import type { BoardRead }          from '../api/BoardReadClient.ts';
import { BoardStateUpdate }        from './BoardStateUpdate.ts';

/** The update never looks inside a board, so a stand-in carries only its version and a mark to tell two apart. */
function boardMarked(project: string): BoardDocument {
  return { boardVersion: 1, project } as unknown as BoardDocument;
}

describe('the board after an event', () => {
  test('board-changed asks for a read of the board, and no part\'s event does', () => {
    expect(BoardStateUpdate.readIsDueAfter({ boardVersion: 1, kind: 'board-changed' })).toBe(true);
    const partEvents: BoardEventDocument[] = BOARD_PART_NAMES.map((part) => ({ boardVersion: 1, kind: 'part-changed', part }));
    expect(partEvents.map(BoardStateUpdate.readIsDueAfter)).toEqual(BOARD_PART_NAMES.map(() => false));
  });
});

describe('the board after a read', () => {
  test('a read board replaces the board whole, also before the first', () => {
    const first = boardMarked('Example Agency');
    const second = boardMarked('Example Agency, read again');
    expect(BoardStateUpdate.boardAfterRead(null, { verdict: 'read', board: first })).toBe(first);
    expect(BoardStateUpdate.boardAfterRead(first, { verdict: 'read', board: second })).toBe(second);
  });

  test('a read that failed keeps the board shown, and none before the first', () => {
    const shown = boardMarked('Example Agency');
    const failedReads: BoardRead[] = [
      { verdict: 'refused', refusal: 'forge-unreachable' },
      { verdict: 'unreadable' },
      { verdict: 'unreachable' },
      { verdict: 'no-session' },
    ];
    expect(failedReads.map((read) => BoardStateUpdate.boardAfterRead(shown, read))).toEqual(failedReads.map(() => shown));
    expect(failedReads.map((read) => BoardStateUpdate.boardAfterRead(null, read))).toEqual(failedReads.map(() => null));
  });
});
