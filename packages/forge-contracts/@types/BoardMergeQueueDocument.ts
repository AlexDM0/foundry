/**
 * The board document's merge queue: the tickets queued for a merge, and per target its Airlock holder, its waiting candidates in order with
 * git's prediction of each one's merge, the tickets that wait for the user's accept, and the decisions its landings wait on.
 */
import type { TicketPriority } from '../constants/BoardVocabulary.ts';


/** git's prediction of a ticket's merge into the target's current tip. */
export type BoardMergePrediction = 'clean' | 'conflicting' | 'prediction-failed';

/** One waiting candidate on a target, in the merge queue's order. */
export interface BoardMergeQueueEntryDocument {
  readonly ticketId:        string;
  readonly priority:        TicketPriority;
  readonly againstTarget:   BoardMergePrediction;
  /** Empty when clean, the files git named when conflicting, `null` when the prediction failed. */
  readonly conflictedFiles: readonly string[] | null;
  /** The other clean candidates whose merge this one's would conflict with. */
  readonly conflictsCaused: number;
}

/** With merge approval on: a reviewed ticket that waits for the user's accept, and git's prediction of its merge. */
export interface BoardWaitingForMergeEntryDocument {
  readonly ticketId:        string;
  readonly priority:        TicketPriority;
  readonly againstTarget:   BoardMergePrediction;
  /** Empty when clean, the files git named when conflicting, `null` when the prediction failed. */
  readonly conflictedFiles: readonly string[] | null;
}

/** The merge or refresh job that holds a target's Airlock. */
export interface BoardAirlockHolderDocument {
  readonly jobId:     string;
  readonly ticketIds: readonly string[];
  readonly phase:     string;
}

export interface BoardMergeTargetDocument {
  readonly target:                 string;
  readonly holder:                 BoardAirlockHolderDocument | null;
  readonly order:                  readonly BoardMergeQueueEntryDocument[];
  /** Empty with merge approval off; in readiness order. */
  readonly waitingForMerge:        readonly BoardWaitingForMergeEntryDocument[];
  readonly pairwiseConflicts:      readonly (readonly [string, string])[];
  readonly targetMovedDecisionIds: readonly string[];
}

export interface BoardMergeQueueDocument {
  /** The in-review tickets queued for a merge, in board order. */
  readonly queuedTicketIds: readonly string[];
  /** Every target with an Airlock holder or a queued ticket; empty when the forge reads no merge targets. */
  readonly targets:         readonly BoardMergeTargetDocument[];
}
