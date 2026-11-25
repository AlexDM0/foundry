/**
 * The jobs of a forge's board as the page reads them: each live job with its facts, the stop holds and the offers the forge serves for it, the
 * jobs that left the board, each open ticket's forecast, and the merge queue.
 */
import type { BoardJobNotLaunchedDocument } from './BoardAgentDocuments.ts';
import type {
  BoardInterruptionCause,
  BoardJobState,
  BoardJobStopMode,
  BoardJobStopRequest,
  BoardJobTurn,
  BoardLostLineKind,
  BoardMergePrediction,
  BoardResumeWait,
  BoardSessionLineRole,
  BoardSubagentState,
  BoardTicketPriority,
} from './BoardVocabulary.ts';

export interface BoardLastToolCallDocument {
  readonly toolName:  string;
  readonly startedAt: string | null;
  readonly running:   boolean;
}

export interface BoardSubagentDocument {
  readonly parentToolUseId: string;
  readonly toolCalls:       number;
  readonly lastToolCall:    BoardLastToolCallDocument | null;
  readonly tokens:          number;
  readonly state:           BoardSubagentState;
  readonly description:     string | null;
}

export interface BoardSessionLastLineDocument {
  readonly role: BoardSessionLineRole;
  readonly text: string;
  readonly at:   string | null;
}

/** A gate or install line a crash or a reboot cut short, which waits for the user's resume. */
export interface BoardLostLineDocument {
  readonly line:  BoardLostLineKind;
  readonly cause: BoardInterruptionCause;
}

export interface BoardJobLiveFactsDocument {
  readonly calls:                  number;
  readonly callBudget:             number | null;
  readonly tokens:                 number;
  readonly toolCalls:              number;
  readonly lastToolCall:           BoardLastToolCallDocument | null;
  readonly subagents:              readonly BoardSubagentDocument[];
  readonly toolCallsWithSubagents: number;
  readonly silentSweeps:           number;
  readonly turn:                   BoardJobTurn | null;
  readonly messagesWaiting:        number;
  readonly lastLine:               BoardSessionLastLineDocument | null;
}

export interface BoardJobIntakeDocument {
  readonly text:  string;
  readonly title: string | null;
}

/** What the job accepts now. */
export interface BoardJobOffersDocument {
  readonly stopModes:    readonly BoardJobStopMode[];
  readonly takesFresh:   boolean;
  readonly takesMessage: boolean;
}

/** The hold each stop mode leaves on the job's tickets, as the forge words it. */
export interface BoardJobStopHoldsDocument {
  readonly stop:     string;
  readonly windDown: string;
}

export interface BoardJobDocument {
  readonly id:            string;
  readonly kind:          string;
  readonly role:          string | null;
  readonly ticketIds:     readonly string[];
  readonly state:         BoardJobState;
  readonly attempt:       number;
  readonly childInstance: number;
  readonly crashResumes:  number;
  readonly launchedAt:    string | null;
  /** The Airlock phase the job holds; `null` unless it holds its target's Airlock. */
  readonly airlockPhase:  string | null;
  readonly interruption:  BoardInterruptionCause | null;
  readonly lostLine:      BoardLostLineDocument | null;
  /** What the job follows while it waits for a resume, as the forge serves it; `null` for a job that waits for none. */
  readonly waitsFor:      BoardResumeWait | null;
  readonly stopRequest:   BoardJobStopRequest | null;
  readonly intake:        BoardJobIntakeDocument | null;
  readonly entity:        string | null;
  /** Set while the job's launch stands refused for its agent's program: the forge does not try it again until that changes. */
  readonly notLaunched:   BoardJobNotLaunchedDocument | null;
  readonly live:          BoardJobLiveFactsDocument;
  readonly stopHolds:     BoardJobStopHoldsDocument;
  readonly offers:        BoardJobOffersDocument;
}

export interface BoardEndedJobDocument {
  readonly id:        string;
  readonly kind:      string;
  readonly role:      string | null;
  readonly ticketIds: readonly string[];
  readonly attempt:   number;
  readonly outcome:   string;
  readonly cause:     string | null;
  readonly endedAt:   string;
}

export type BoardForecastStepDocument =
  | { readonly kind: 'build'; readonly attempt: number; readonly jobId: string | null }
  | { readonly kind: 'customs-and-gates'; readonly gateNames: readonly string[]; readonly jobId: string | null }
  | { readonly kind: 'review'; readonly round: number; readonly jobId: string | null }
  | { readonly kind: 'merge-approval'; readonly target: string | null }
  | { readonly kind: 'land'; readonly target: string | null }
  | { readonly kind: 'integrate'; readonly target: string | null; readonly group: string };

export interface BoardTicketDependentDocument {
  readonly ticketId:                string;
  readonly stillWaitingOnTicketIds: readonly string[];
}

export interface BoardTicketForecastDocument {
  readonly ticketId:         string;
  readonly steps:            readonly BoardForecastStepDocument[];
  readonly currentStepIndex: number | null;
  readonly dependents:       readonly BoardTicketDependentDocument[];
}

export interface BoardMergeCandidateDocument {
  readonly ticketId:        string;
  readonly priority:        BoardTicketPriority;
  readonly againstTarget:   BoardMergePrediction;
  /** `null` when the prediction failed. */
  readonly conflictedFiles: readonly string[] | null;
}

export interface BoardMergeQueueEntryDocument extends BoardMergeCandidateDocument {
  readonly conflictsCaused: number;
}

export interface BoardAirlockHolderDocument {
  readonly jobId:     string;
  readonly ticketIds: readonly string[];
  readonly phase:     string;
}

export interface BoardMergeTargetDocument {
  readonly target:                 string;
  readonly holder:                 BoardAirlockHolderDocument | null;
  readonly order:                  readonly BoardMergeQueueEntryDocument[];
  readonly waitingForMerge:        readonly BoardMergeCandidateDocument[];
  readonly pairwiseConflicts:      readonly (readonly [string, string])[];
  readonly targetMovedDecisionIds: readonly string[];
}

export interface BoardMergeQueueDocument {
  readonly queuedTicketIds: readonly string[];
  readonly targets:         readonly BoardMergeTargetDocument[];
}
