import type { BoardTargetSubject } from './BoardVocabulary.ts';

/** The thing a board entry opens, by its subject and id; the page's board router turns it into a route. */
export interface BoardTargetDocument {
  readonly subject: BoardTargetSubject;
  readonly id:      string;
}
