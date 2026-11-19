/**
 * The parts of the Overseer's `BoardState` document that its readers map: each job with its live facts, the jobs that left the board, the
 * merge queue, the Overseer, the usage windows and the picture limits. The Overseer's services build them; an adapter maps them into the
 * contract's board document.
 */
import type { InterruptionCause, Job, LostLineKind } from '../../lib/tracker-model/@types/Job.ts';
import type { TicketPriority }                       from '../../lib/tracker-model/@types/Ticket.ts';
import type { MergeForecast, PairwiseConflict }      from '../../lib/tracker-model/utils/MergeQueueUtil.ts';
import type { TranscriptRole }                       from '../../shared/@types/TranscriptEntry.ts';

export interface LastToolCall {
  toolName:  string;
  /** The Talos event log entry's stamp; `null` for an entry written before stamps. */
  startedAt: string | null;
  /** True until the call's result arrives. */
  running:   boolean;
}

export interface SubagentLiveFacts {
  parentToolUseId: string;
  toolCalls:       number;
  lastToolCall:    LastToolCall | null;
  tokens:          number;
  /** `running` while the parent call that spawned it has no result; a subagent whose parent call the log does not hold reads `ended`. */
  state:           SubagentState;
  /** The parent call's `description` input, or the one its agent recorded beside its transcript; `null` without one. */
  description:     string | null;
}

export type SubagentState = 'running' | 'ended';

/** Whether a message sent now reaches the session between turns or waits behind the turn under way. */
export type JobTurn = 'between-turns' | 'mid-turn';

/** The newest line of a session's own words, or of User's chat to it, so a list of sessions shows it with no stream per row. */
export interface SessionLastLine {
  role: Extract<TranscriptRole, 'assistant' | 'user'>;
  text: string;
  /** The Talos event log entry's stamp; `null` for an entry written before stamps. */
  at:   string | null;
}

/** A usage window as the session reported it, whether or not the vendor refused requests in it. */
export interface UsageWindowReport {
  /** The window's name as the agent reported it, an opaque value. */
  window:      string;
  /** `null` for a window the agent's adapter does not know. */
  lengthHours: number | null;
  /** `null` when the vendor named no usable reset. */
  resetsAt:    string | null;
  /** The Talos event log entry's stamp; `null` for an entry written before stamps. */
  reportedAt:  string | null;
}

export interface JobLiveFacts {
  jobId:                  string;
  /** API turns of the job's own session, the count its call budget is held against. */
  calls:                  number;
  /** `null` for a job no budget holds. */
  callBudget:             number | null;
  tokens:                 number;
  toolCalls:              number;
  lastToolCall:           LastToolCall | null;
  subagents:              SubagentLiveFacts[];
  toolCallsWithSubagents: number;
  /**
   * The newest instance's: `mid-turn` while it took more chats than its session printed results. The Assistant's is the idle rule its
   * deliveries wait on. `null` for a job with no agent session, and before its first instance logged a line.
   */
  turn:                   JobTurn | null;
  /** User's `job message` records its session has not taken yet. */
  messagesWaiting:        number;
  /** For an Assistant, product-owner or pipeline agent job only; `null` for every other job, and before the session said anything. */
  lastLine:               SessionLastLine | null;
  /** The newest usage window the session reported, of any instance; `null` before it reported one. */
  usageWindow:            UsageWindowReport | null;
}

export type OverseerRuntimeState = 'serving' | 'held-by-install-change' | 'passing-baton' | 'down';

export interface OverseerFacts {
  state:            OverseerRuntimeState;
  paused:           boolean;
  url:              string | null;
  generation:       number | null;
  codeVersion:      string;
  installVersion:   number;
  /** The last Baton pass that failed while this Overseer kept driving; `null` when none did. */
  batonPassWarning: unknown;
}

/** The newest observation of one usage window of the agent's plan. */
export interface UsageWindowFacts {
  /** The window's name as the agent reported it, an opaque value. */
  window:      string;
  /** `null` for a window the agent's adapter does not know. */
  lengthHours: number | null;
  /** The whole percent of the window used, 0 to 100. */
  utilization: number;
  resetsAt:    string;
}

export interface UsageFacts {
  /** From the machine's usage marker: no launch happens before it; `null` when no limit was hit. */
  resetsAt: string | null;
  window:   string | null;
  /** From the machine's usage windows: empty before the first observation and under API billing. */
  windows:  UsageWindowFacts[];
}

/** One waiting candidate on a target, in the merge queue's order. */
export interface MergeQueueEntry {
  ticketId:        string;
  priority:        TicketPriority;
  againstTarget:   MergeForecast;
  /** Empty when clean, the files git named when conflicting, `null` when the prediction failed. */
  conflictedFiles: string[] | null;
  /** The other clean candidates whose merge this one's would conflict with. */
  conflictsCaused: number;
}

/** With merge approval on: a reviewed ticket waiting for User's accept, and git's prediction of its merge into the target's current tip. */
export interface WaitingForMergeEntry {
  ticketId:        string;
  priority:        TicketPriority;
  againstTarget:   MergeForecast;
  /** Empty when clean, the files git named when conflicting, `null` when the prediction failed. */
  conflictedFiles: string[] | null;
}

/** One merge target: its Airlock holder, its waiting candidates in order, and the decisions its landings wait on. */
export interface MergeTargetFacts {
  target:                 string;
  holder:                 { jobId: string; ticketIds: string[]; phase: string } | null;
  order:                  MergeQueueEntry[];
  /** Empty with merge approval off; in readiness order. */
  waitingForMerge:        WaitingForMergeEntry[];
  pairwiseConflicts:      PairwiseConflict[];
  targetMovedDecisionIds: string[];
}

export interface MergeQueueFacts {
  /** In-review tickets queued for a merge, in board order. */
  queuedTicketIds: string[];
  /** Each merge or refresh job holding its target's slot. */
  slots:           { jobId: string; target: string; phase: string }[];
  /** Every target with a slot holder or a queued ticket; empty when the reading carries no forecasting. */
  targets:         MergeTargetFacts[];
}

/** What a message or an intake request may carry, so the Bridge refuses a picture before its upload and keeps no copy of the rule. */
export interface PictureLimits {
  perMessage:     number;
  sizeLimitBytes: number;
  mediaTypes:     string[];
}

/** The live facts plus the DrivePass's in-memory count of quiet sweeps, which no event log holds. */
export type JobLiveFactsWithSilence = JobLiveFacts & { silentSweeps: number };

/** A job's line a crash or a reboot cut short, from its newest `job-line-lost` record. */
export interface LostLineFacts {
  line:  LostLineKind;
  cause: InterruptionCause;
}

export type JobWithLiveFacts = Readonly<Job> & {
  /** The newest `job-launched` record's stamp, shown as the job's elapsed time and never read to decide; `null` when the log lost it. */
  launchedAt: string | null;
  live:       JobLiveFactsWithSilence;
  /** `null` unless a gate or install line of the job that a crash or a reboot cut short waits for User's resume. */
  lostLine:   LostLineFacts | null;
};

export interface EndedJob {
  id:        string;
  kind:      Job['kind'];
  role:      Job['role'];
  ticketIds: string[];
  target:    string | null;
  attempt:   number;
  state:     'ended';
  outcome:   string;
  cause:     string | null;
  endedAt:   string;
}
