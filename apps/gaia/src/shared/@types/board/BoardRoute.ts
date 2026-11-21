import type { BoardTabName } from './BoardVocabulary.ts';

/** A place on a forge's board: its tab, and the item it opens there, `null` for the tab alone. */
export interface BoardRoute {
  readonly tab:  BoardTabName;
  readonly item: string | null;
}
