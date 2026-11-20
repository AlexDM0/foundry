/**
 * The board document's jobs: each job on the board with its live facts, the jobs that left it, and what lies ahead of each open ticket.
 * Values only; a view words them.
 */
import type { EntityKey, JobState }                               from '../constants/BoardVocabulary.ts';
import type { MONITOR_INTERRUPTION_CAUSES }                       from '../constants/MonitorInterruptionCauses.ts';
import type { BoardJobOffersDocument, BoardJobStopHoldsDocument } from './BoardReadingDocuments.ts';


/** Why a job was last interrupted; `lease-ended`, `network-outage`, `forge-stopped` and `forge-crashed` wait for the user's resume. */
export type BoardInterruptionCause = (typeof MONITOR_INTERRUPTION_CAUSES)[number];

/** What the user asked of a live job: `stop` and `wind-down` hold its ticket, `fresh` stops it for a fresh agent on the same worktree. */
export type BoardJobStopRequest = 'stop' | 'wind-down' | 'fresh';

/** Whether a message sent now reaches the session between turns or waits behind the turn under way. */
export type BoardJobTurn = 'between-turns' | 'mid-turn';

export interface BoardLastToolCallDocument {
  readonly toolName:  string;
  /** `null` for a call logged before stamps, which shows no elapsed time. */
  readonly startedAt: string | null;
  /** True until the call's result arrives. */
  readonly running:   boolean;
}

export interface BoardSubagentDocument {
  readonly parentToolUseId: string;
  readonly toolCalls:       number;
  readonly lastToolCall:    BoardLastToolCallDocument | null;
  readonly tokens:          number;
  /** `running` while the parent call that spawned it has no result. */
  readonly state:           'running' | 'ended';
  /** The parent call's description; `null` without one. */
  readonly description:     string | null;
}

/** The newest line the session or the user said. */
export interface BoardSessionLastLineDocument {
  readonly role: 'assistant' | 'user';
  readonly text: string;
  /** `null` for a line logged before stamps. */
  readonly at:   string | null;
}

/** A gate or install line of the job that a crash or a reboot cut short, and which waits for the user's resume. */
export interface BoardLostLineDocument {
  readonly line:  'gate' | 'install';
  readonly cause: BoardInterruptionCause;
}

/** What the forge reads of a job's session as it runs. */
export interface BoardJobLiveFactsDocument {
  /** The session's API turns, the count its call budget is held against. */
  readonly calls:                  number;
  /** `null` for a job no budget holds. */
  readonly callBudget:             number | null;
  readonly tokens:                 number;
  readonly toolCalls:              number;
  readonly lastToolCall:           BoardLastToolCallDocument | null;
  readonly subagents:              readonly BoardSubagentDocument[];
  readonly toolCallsWithSubagents: number;
  /** The passes in a row that found the session silent. */
  readonly silentSweeps:           number;
  /** `null` for a job with no agent session, and before its first line. */
  readonly turn:                   BoardJobTurn | null;
  /** The user's messages its session has not taken yet. */
  readonly messagesWaiting:        number;
  /** For an Assistant, product-owner or pipeline agent job only; `null` for every other job, and before the session said anything. */
  readonly lastLine:               BoardSessionLastLineDocument | null;
}

/** A product-owner job's intake: the user's request and, once the product owner gave one, its short title. */
export interface BoardJobIntakeDocument {
  readonly text:  string;
  readonly title: string | null;
}

/** The phase of the Airlock a merge or refresh job holds. */
export interface BoardJobAirlockDocument {
  readonly phase: string;
}

/** A job on the board. */
export interface BoardJobDocument {
  readonly id:            string;
  readonly kind:          string;
  /** `null` for a merge, refresh or constitution commit job, which runs no agent of its own. */
  readonly role:          string | null;
  readonly ticketIds:     readonly string[];
  readonly state:         JobState;
  /** From 1; a fresh agent after a failed pass is a new job one attempt on. */
  readonly attempt:       number;
  /** The newest child instance spawned or to spawn, from 1. */
  readonly childInstance: number;
  /** The resumes after a crash so far; two are automatic, and the user's resume gives them back. */
  readonly crashResumes:  number;
  /** The stamp of the job's newest launch, only ever shown; `null` while launching or when the log lost it. */
  readonly launchedAt:    string | null;
  /** `null` unless the job holds its target's Airlock. */
  readonly airlock:       BoardJobAirlockDocument | null;
  /** The cause of the job's last interruption, which stays once the job resumes; `null` on a job never interrupted. */
  readonly interruption:  BoardInterruptionCause | null;
  /** `null` unless a lost line of the job waits for the user's resume. */
  readonly lostLine:      BoardLostLineDocument | null;
  /** Set once the user asked the job to stop, wind down or make way for a fresh agent: the job is stopping. */
  readonly stopRequest:   BoardJobStopRequest | null;
  /** On a product-owner job only. */
  readonly intake:        BoardJobIntakeDocument | null;
  /** On a forge with entities: the entity whose stage the job runs. */
  readonly entity:        EntityKey | null;
  readonly live:          BoardJobLiveFactsDocument;
  readonly stopHolds:     BoardJobStopHoldsDocument;
  readonly offers:        BoardJobOffersDocument;
}

/** A job that left the board, and how it ended. */
export interface BoardEndedJobDocument {
  readonly id:        string;
  readonly kind:      string;
  readonly role:      string | null;
  readonly ticketIds: readonly string[];
  readonly attempt:   number;
  readonly outcome:   string;
  /** What ended it, worded by the forge; `null` when the outcome says it all. */
  readonly cause:     string | null;
  readonly endedAt:   string;
}

/**
 * A step of a ticket's journey. A `jobId` names the live job doing the step, `null` while none is. A `target` is `null` when the forge
 * reads no merge targets.
 */
export type BoardTicketForecastStepDocument =
  | { readonly kind: 'build'; readonly attempt: number; readonly jobId: string | null }
  /** `gateNames`: the build phase's gates in run order, which judge a build. */
  | { readonly kind: 'customs-and-gates'; readonly gateNames: readonly string[]; readonly jobId: string | null }
  | { readonly kind: 'review'; readonly round: number; readonly jobId: string | null }
  | { readonly kind: 'merge-approval'; readonly target: string | null }
  | { readonly kind: 'land'; readonly target: string | null }
  | { readonly kind: 'integrate'; readonly target: string | null; readonly group: string };

/** An open ticket that waits on the forecast's ticket, with the other tickets it still waits on. */
export interface BoardTicketDependentDocument {
  readonly ticketId:                string;
  readonly stillWaitingOnTicketIds: readonly string[];
}

/** An open ticket's steps to its landing and the tickets waiting on it. */
export interface BoardTicketForecastDocument {
  readonly ticketId:         string;
  /** From the step under way, or the next one, to the landing. */
  readonly steps:            readonly BoardTicketForecastStepDocument[];
  /** `0` while the first step is under way; `null` while nothing runs on the ticket. */
  readonly currentStepIndex: number | null;
  readonly dependents:       readonly BoardTicketDependentDocument[];
}
