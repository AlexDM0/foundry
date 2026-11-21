import type { BoardTargetSubject } from './BoardVocabulary.ts';

/** The thing a board entry opens, by its subject and id; where that is drawn is the page's to decide. */
export interface BoardTarget {
  readonly subject: BoardTargetSubject;
  readonly id:      string;
}
