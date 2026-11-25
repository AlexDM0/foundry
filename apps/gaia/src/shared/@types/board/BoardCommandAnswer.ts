import type { BoardRefusal } from './BoardRefusal.ts';

export type BoardAppliedOutcome = 'done' | 'nothing-to-do';

/**
 * A forge's answer to a board command. `startedJobId` is the job an applied command started, such as an intake's product owner;
 * `writtenVersionNumber` the version a ticket document's save left at the head. `unreadable` names the keys of a body that is no answer the
 * forge's contract describes, at the status it came with.
 */
export type BoardCommandAnswer =
  | {
    readonly outcome:              'applied';
    readonly applied:              BoardAppliedOutcome;
    readonly startedJobId:         string | null;
    readonly writtenVersionNumber: number | null;
  }
  | { readonly outcome: 'refused'; readonly status: number; readonly refusal: BoardRefusal }
  | { readonly outcome: 'install-held'; readonly refusal: BoardRefusal }
  | { readonly outcome: 'unreadable'; readonly status: number; readonly invalidKeys: readonly string[] };
