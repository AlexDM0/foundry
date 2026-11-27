/**
 * The items a board view marks `data-changed` after a board update: new or moved since the board it showed before, as the view's own
 * comparison answers. A mark goes once its highlight has played, so the next move of the same item plays it again.
 */
import { useCallback, useState } from 'react';

import { ChangeHighlightUtil } from '../utils/ChangeHighlightUtil.ts';

export function useChangedKeys<BoardState>(
  boardState: BoardState,
  changedKeysBetween: (previous: BoardState, current: BoardState) => ReadonlySet<string>,
): [ReadonlySet<string>, (shownKey: string) => void] {
  const [shownBoardState, setShownBoardState] = useState(boardState);
  const [changedKeys, setChangedKeys] = useState<ReadonlySet<string>>(() => new Set());
  if (boardState !== shownBoardState) {
    setChangedKeys(changedKeysBetween(shownBoardState, boardState));
    setShownBoardState(boardState);
  }
  const clearChange = useCallback((shownKey: string) => setChangedKeys((changed) => ChangeHighlightUtil.withoutKey(changed, shownKey)), []);
  return [changedKeys, clearChange];
}
