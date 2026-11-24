/**
 * The jobs of a forge's board as Gaia holds them: each live job with its facts, the stop holds and the offers the forge serves for it, the
 * jobs that left the board, each open ticket's forecast, and the merge queue.
 */
import type { BoardJobNotLaunched } from './BoardAgent.ts';
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

export interface BoardLastToolCall {
  readonly toolName:  string;
  readonly startedAt: string | null;
  readonly running:   boolean;
}

export interface BoardSubagent {
  readonly parentToolUseId: string;
  readonly toolCalls:       number;
  readonly lastToolCall:    BoardLastToolCall | null;
  readonly tokens:          number;
  readonly state:           BoardSubagentState;
  readonly description:     string | null;
}

export interface BoardSessionLastLine {
  readonly role: BoardSessionLineRole;
  readonly text: string;
  readonly at:   string | null;
}

/** A gate or install line a crash or a reboot cut short, which waits for the user's resume. */
export interface BoardLostLine {
  readonly line:  BoardLostLineKind;
  readonly cause: BoardInterruptionCause;
}

export interface BoardJobLiveFacts {
  readonly calls:                  number;
  readonly callBudget:             number | null;
  readonly tokens:                 number;
  readonly toolCalls:              number;
  readonly lastToolCall:           BoardLastToolCall | null;
  readonly subagents:              readonly BoardSubagent[];
  readonly toolCallsWithSubagents: number;
  readonly silentSweeps:           number;
  readonly turn:                   BoardJobTurn | null;
  readonly messagesWaiting:        number;
  readonly lastLine:               BoardSessionLastLine | null;
}

export interface BoardJobIntake {
  readonly text:  string;
  readonly title: string | null;
}

/** What the job accepts now. */
export interface BoardJobOffers {
  readonly stopModes:    readonly BoardJobStopMode[];
  readonly takesFresh:   boolean;
  readonly takesMessage: boolean;
}

/** The hold each stop mode leaves on the job's tickets, as the forge words it. */
export interface BoardJobStopHolds {
  readonly stop:     string;
  readonly windDown: string;
}

export interface BoardJob {
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
  readonly lostLine:      BoardLostLine | null;
  /** What the job follows as the forge's presence lists its waiting work; `null` for a job presence does not list. */
  readonly waitsFor:      BoardResumeWait | null;
  readonly stopRequest:   BoardJobStopRequest | null;
  readonly intake:        BoardJobIntake | null;
  readonly entity:        string | null;
  /** Set while the job's launch stands refused for its agent's program: the forge does not try it again until that changes. */
  readonly notLaunched:   BoardJobNotLaunched | null;
  readonly live:          BoardJobLiveFacts;
  readonly stopHolds:     BoardJobStopHolds;
  readonly offers:        BoardJobOffers;
}

export interface BoardEndedJob {
  readonly id:        string;
  readonly kind:      string;
  readonly role:      string | null;
  readonly ticketIds: readonly string[];
  readonly attempt:   number;
  readonly outcome:   string;
  readonly cause:     string | null;
  readonly endedAt:   string;
}

export type BoardForecastStep =
  | { readonly kind: 'build'; readonly attempt: number; readonly jobId: string | null }
  | { readonly kind: 'customs-and-gates'; readonly gateNames: readonly string[]; readonly jobId: string | null }
  | { readonly kind: 'review'; readonly round: number; readonly jobId: string | null }
  | { readonly kind: 'merge-approval'; readonly target: string | null }
  | { readonly kind: 'land'; readonly target: string | null }
  | { readonly kind: 'integrate'; readonly target: string | null; readonly group: string };

export interface BoardTicketDependent {
  readonly ticketId:                string;
  readonly stillWaitingOnTicketIds: readonly string[];
}

export interface BoardTicketForecast {
  readonly ticketId:         string;
  readonly steps:            readonly BoardForecastStep[];
  readonly currentStepIndex: number | null;
  readonly dependents:       readonly BoardTicketDependent[];
}

export interface BoardMergeCandidate {
  readonly ticketId:        string;
  readonly priority:        BoardTicketPriority;
  readonly againstTarget:   BoardMergePrediction;
  /** `null` when the prediction failed. */
  readonly conflictedFiles: readonly string[] | null;
}

export interface BoardMergeQueueEntry extends BoardMergeCandidate {
  readonly conflictsCaused: number;
}

export interface BoardAirlockHolder {
  readonly jobId:     string;
  readonly ticketIds: readonly string[];
  readonly phase:     string;
}

export interface BoardMergeTarget {
  readonly target:                 string;
  readonly holder:                 BoardAirlockHolder | null;
  readonly order:                  readonly BoardMergeQueueEntry[];
  readonly waitingForMerge:        readonly BoardMergeCandidate[];
  readonly pairwiseConflicts:      readonly (readonly [string, string])[];
  readonly targetMovedDecisionIds: readonly string[];
}

export interface BoardMergeQueue {
  readonly queuedTicketIds: readonly string[];
  readonly targets:         readonly BoardMergeTarget[];
}
