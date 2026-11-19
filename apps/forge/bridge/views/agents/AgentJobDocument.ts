/** The fields of a `BoardState` job (`GET /api/state`, the `job` event) the Agents view reads: the board record and the Overseer's live facts. */
import type { IdentifiedRecord } from '../../@types/BoardStateDocument.ts';

export interface LastToolCallDocument {
  readonly toolName:  string;
  /** `null` for a call logged before stamps, which shows no elapsed time. */
  readonly startedAt: string | null;
  readonly running:   boolean;
}

export interface SubagentDocument {
  readonly parentToolUseId: string;
  readonly toolCalls:       number;
  readonly lastToolCall:    LastToolCallDocument | null;
  readonly tokens:          number;
  /** `running` while the parent call that spawned it has no result. */
  readonly state:           'running' | 'ended';
  /** The parent call's `description` input; `null` without one. */
  readonly description:     string | null;
}

export interface JobLiveFactsDocument {
  readonly calls:                  number;
  readonly callBudget:             number | null;
  readonly tokens:                 number;
  readonly toolCalls:              number;
  readonly lastToolCall:           LastToolCallDocument | null;
  readonly subagents:              readonly SubagentDocument[];
  readonly toolCallsWithSubagents: number;
  readonly silentSweeps:           number;
}

export interface AgentJobDocument extends IdentifiedRecord {
  readonly kind:          string;
  readonly role:          string | null;
  readonly ticketIds:     readonly string[];
  readonly state:         string;
  readonly attempt:       number;
  readonly childInstance: number;
  readonly crashResumes:  number;
  /** The stamp of the job's newest launch record, only ever shown; `null` while launching or when the log lost it. */
  readonly launchedAt:    string | null;
  readonly airlock?:      { readonly phase: string };
  /** The cause of the job's last interruption; it stays once the job resumes. */
  readonly interruption?: string;
  readonly stopRequest?:  string;
  /** A product-owner job's request, and the short title the product owner gave it once it ran `intake title`. */
  readonly intake?:       { readonly text: string; readonly title?: string };
  readonly live:          JobLiveFactsDocument;
}

/** A job that left the board, as the board's `endedJobs` serves it, newest last. */
export interface EndedAgentJobDocument extends IdentifiedRecord {
  readonly outcome: string;
}

export interface JobDecisionDocument extends IdentifiedRecord {
  readonly jobId: string | null;
}

/** An open decision as the Asks User strip reads it: what it asks first, and since when. */
export interface AskingDecisionDocument extends JobDecisionDocument {
  readonly questions: readonly { readonly question: string }[];
  readonly openedAt:  string;
}
