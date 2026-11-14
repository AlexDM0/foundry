/** The fields of the Overseer's `BoardState` (`GET /api/state`, the `board` event) the shell reads; each view adds the fields it uses. */
import type { DraftState } from '../../src/lib/tracker-model/@types/Draft.ts';
import type { LogRecord }  from '../../src/lib/tracker-model/@types/LogRecord.ts';
import type {
  AppliedPipelineFacts,
  GateProfileRunFacts,
  PipelineChoices,
  PipelineFlowFacts,
  PipelineSetupFacts
} from '../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { AgentPair }       from '../../src/lib/tracker-model/@types/Ticket.ts';
import type { TimestampSlices } from '../utils/TimeUtil.ts';

export interface IdentifiedRecord {
  readonly id: string;
}

export type OverseerRuntimeState = 'serving' | 'held-by-install-change' | 'passing-baton' | 'down';

/** The last Baton pass that failed while this Overseer kept driving. */
export interface BatonPassWarningDocument {
  readonly successorCodeVersion: string;
  readonly step:                 string;
  readonly error:                string;
}

export interface OverseerFactsDocument {
  readonly state:             OverseerRuntimeState;
  readonly paused:            boolean;
  readonly codeVersion:       string;
  readonly batonPassWarning?: BatonPassWarningDocument | null;
}

/** A notice the Overseer derives each pass: its `kind` and the facts that kind carries. */
export interface NoticeDocument {
  readonly kind:           string;
  readonly [fact: string]: unknown;
}

export interface ConcurrencyDocument {
  readonly limit:          number;
  readonly agentsInFlight: number;
}

/** Which jobs hold the launch slots `concurrency` counts, and the in-progress tickets no job works on; the Bridge joins on these ids. */
export interface LaunchSlotsDocument {
  readonly limit:                         number;
  readonly slotJobIds:                    readonly string[];
  readonly inProgressTicketIdsWithoutJob: readonly string[];
}

/** The newest observation of one usage window the plan has, such as `five_hour` or `seven_day`. */
export interface UsageWindowDocument {
  readonly window:      string;
  /** Percent of the window used, 0 to 100. */
  readonly utilization: number;
  readonly resetsAt:    string | null;
}

export interface UsageDocument {
  readonly resetsAt: string | null;
  readonly window:   string | null;
  /** Empty or missing before the first observation and under API billing. */
  readonly windows?: readonly UsageWindowDocument[];
}

export interface TaskDocument {
  readonly id:        number;
  readonly name:      string;
  readonly status:    string;
  readonly start:     string | null;
  readonly end:       string | null;
  readonly ticket:    string | null;
  readonly tokens?:   number | null;
  readonly reviewOf?: string;
}

export interface PageTicketDocument {
  readonly id:          string;
  readonly title:       string;
  readonly status:      string;
  /** Always served; optional so the views' narrower ticket types, which never read it, still fit. */
  readonly filed?:      string;
  readonly updated:     string;
  readonly delivered:   string | null;
  readonly abandonedAt: string | null;
}

export interface EpicRollupDocument {
  readonly key:                 string;
  readonly title:               string;
  readonly slot:                number;
  readonly ticketIds:           readonly string[];
  readonly ticketCountByStatus: Readonly<Record<string, number>>;
  readonly tokens:              number;
  readonly span:                { readonly start: string; readonly end: string | null } | null;
}

/** An open filing draft as the Board's facts list it, as far as the shell reads it. */
export interface PageDraftDocument {
  readonly id:                string;
  readonly title:             string;
  readonly state:             DraftState;
  readonly openQuestionCount: number;
  readonly openedAt:          string;
}

/** The page payload the render service assembles, as far as the Bridge's views read it. */
export interface PageDocument {
  readonly payload: {
    readonly progress:         { readonly tasks: readonly TaskDocument[] };
    readonly epicDescriptions: readonly { readonly key: string; readonly descriptionHtml: string }[];
    readonly boardFacts:       {
      readonly epics:   readonly EpicRollupDocument[];
      readonly tickets: readonly { readonly ticketId: string; readonly displayState: string }[];
      readonly drafts?: readonly PageDraftDocument[];
    };
    readonly limits?: TimestampSlices;
  };
  readonly tickets: readonly PageTicketDocument[];
}

export interface MergeQueueEntryDocument {
  readonly ticketId:        string;
  readonly priority:        string;
  readonly againstTarget:   'clean' | 'conflicting' | 'prediction-failed';
  readonly conflictedFiles: readonly string[] | null;
  readonly conflictsCaused: number;
}

/** With merge approval on: a reviewed ticket that waits for User's accept, and git's prediction of its merge into the target's current tip. */
export interface WaitingForMergeEntryDocument {
  readonly ticketId:        string;
  readonly priority:        string;
  readonly againstTarget:   MergeQueueEntryDocument['againstTarget'];
  /** Empty when clean, the files git named when conflicting, `null` when the prediction failed. */
  readonly conflictedFiles: readonly string[] | null;
}

export interface MergeTargetDocument {
  readonly target:                 string;
  readonly holder:                 { readonly jobId: string; readonly ticketIds: readonly string[]; readonly phase: string } | null;
  readonly order:                  readonly MergeQueueEntryDocument[];
  /** Empty or missing with merge approval off; in readiness order. */
  readonly waitingForMerge?:       readonly WaitingForMergeEntryDocument[];
  readonly pairwiseConflicts:      readonly (readonly [string, string])[];
  readonly targetMovedDecisionIds: readonly string[];
}

export interface MergeQueueDocument {
  readonly targets: readonly MergeTargetDocument[];
}

/** The views' slices are optional, so a board from an older Overseer, or a spec's, shows them empty rather than failing. */
export interface BoardStateDocument {
  readonly project:                string;
  readonly jobs:                   readonly IdentifiedRecord[];
  readonly decisions:              readonly IdentifiedRecord[];
  readonly incidents:              readonly IdentifiedRecord[];
  readonly overseer:               OverseerFactsDocument;
  readonly usage:                  unknown;
  readonly notices?:               readonly NoticeDocument[];
  readonly concurrency?:           ConcurrencyDocument;
  readonly launchSlots?:           LaunchSlotsDocument;
  /** The value `status --json` prints as `confinement`. */
  readonly confinement?:           'confined' | 'unavailable' | 'unconfined-by-design';
  readonly page?:                  PageDocument;
  readonly mergeQueue?:            MergeQueueDocument;
  /** The newest jobs that left the board, oldest first, each with how it ended. */
  readonly endedJobs?:             readonly (IdentifiedRecord & { readonly outcome: string })[];
  readonly pipeline?:              AppliedPipelineFacts;
  /** Null with no open setup, update or advise record. */
  readonly pipelineSetup?:         PipelineSetupFacts | null;
  /** Null with neither a draft nor a readable pipeline to draw. */
  readonly pipelineFlow?:          PipelineFlowFacts | null;
  readonly profileRuns?:           readonly GateProfileRunFacts[];
  /** The newest pipeline records, newest first, for the live view's "Earlier" list. */
  readonly pipelineHistory?:       readonly LogRecord[];
  readonly pipelineChoices?:       PipelineChoices;
  /** The pipeline agent's model and effort while no draft names them. */
  readonly pipelineAgentDefaults?: AgentPair;
}

/** `GET /api/identity`: what the Bridge needs to key its preferences and to notice new code behind the same port. */
export interface OverseerIdentity {
  readonly trackerId:   string;
  readonly project:     string;
  readonly codeVersion: string;
}
