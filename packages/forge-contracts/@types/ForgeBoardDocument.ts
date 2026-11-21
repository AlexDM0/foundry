/**
 * The board document: everything a view of one forge's board reads, from its tickets and jobs to its pipeline, as forge's own types. Its
 * parts are in the files beside it, and the values of its unions in `constants/BoardVocabulary.ts`.
 */
import type {
  BoardDecisionDocument,
  BoardIncidentDocument,
  BoardPictureLimitsDocument,
  BoardQuestionHistoryEntryDocument
} from './BoardConversationDocuments.ts';
import type { BoardEndedJobDocument, BoardJobDocument, BoardTicketForecastDocument } from './BoardJobDocuments.ts';
import type { BoardLimitsDocument }                                                  from './BoardLimitsDocument.ts';
import type { BoardMergeQueueDocument }                                              from './BoardMergeQueueDocument.ts';
import type { BoardPageDocument }                                                    from './BoardPageDocuments.ts';
import type {
  AgentPairDocument,
  BoardAppliedPipelineDocument,
  BoardEntityAssignmentDocument,
  BoardGateCacheMarkDocument,
  BoardGateProfileRunDocument,
  BoardPipelineChoicesDocument,
  BoardPipelineFlowDocument,
  BoardPipelineHistoryEntryDocument,
  BoardPipelineSetupDocument,
  BoardPipelineStepRunTimeDocument
} from './BoardPipelineDocuments.ts';
import type { BoardAttentionEntryDocument, BoardNoticeDocument, BoardTodayDocument } from './BoardReadingDocuments.ts';


export type HephaestusRuntimeState = 'serving' | 'held-by-install-change' | 'passing-baton' | 'down';

/** The last Baton pass that failed while this forge kept driving. */
export interface BoardBatonPassWarningDocument {
  readonly successorCodeVersion: string;
  readonly step:                 string;
  readonly error:                string;
}

export interface BoardHephaestusDocument {
  readonly state:            HephaestusRuntimeState;
  readonly paused:           boolean;
  readonly codeVersion:      string;
  /** `null` when no Baton pass failed. */
  readonly batonPassWarning: BoardBatonPassWarningDocument | null;
}

export interface BoardConcurrencyDocument {
  readonly limit:          number;
  /** The live build and review jobs, the count every launch gate reads. */
  readonly agentsInFlight: number;
}

/** Which jobs hold the launch slots `concurrency` counts, and the in-progress tickets no job works on. */
export interface BoardLaunchSlotsDocument {
  readonly limit:                         number;
  readonly slotJobIds:                    readonly string[];
  readonly inProgressTicketIdsWithoutJob: readonly string[];
}

/** Whether the forge's gate lines run confined, cannot be confined on this machine, or run unconfined by design. */
export type BoardConfinement = 'confined' | 'unavailable' | 'unconfined-by-design';

/** The newest observation of one usage window of the agents' plan. */
export interface BoardUsageWindowDocument {
  /** The window's name as the agent reported it, an opaque value a view words only when its length is unknown. */
  readonly window:      string;
  /** `null` for a window whose length the forge does not know. */
  readonly lengthHours: number | null;
  /** Percent of the window used, 0 to 100. */
  readonly utilization: number;
  readonly resetsAt:    string;
}

export interface BoardUsageDocument {
  /** No launch happens before it; `null` when no limit was hit. */
  readonly resetsAt: string | null;
  readonly window:   string | null;
  /** Empty before the first observation and under API billing. */
  readonly windows:  readonly BoardUsageWindowDocument[];
}

export interface ForgeBoardDocument {
  readonly project:               string;
  readonly hephaestus:            BoardHephaestusDocument;
  readonly concurrency:           BoardConcurrencyDocument;
  readonly launchSlots:           BoardLaunchSlotsDocument;
  readonly confinement:           BoardConfinement;
  readonly usage:                 BoardUsageDocument;
  readonly page:                  BoardPageDocument;
  readonly mergeQueue:            BoardMergeQueueDocument;
  readonly jobs:                  readonly BoardJobDocument[];
  /** The newest jobs that left the board, oldest first. */
  readonly endedJobs:             readonly BoardEndedJobDocument[];
  /** The open decisions, in opening order. */
  readonly decisions:             readonly BoardDecisionDocument[];
  /** The open incidents, in opening order. */
  readonly incidents:             readonly BoardIncidentDocument[];
  /** What a settled decision or incident, or a session job, left in the log. */
  readonly questionHistory:       readonly BoardQuestionHistoryEntryDocument[];
  /** Each open ticket's steps to its landing and the tickets waiting on it. */
  readonly ticketForecasts:       readonly BoardTicketForecastDocument[];
  readonly pipeline:              BoardAppliedPipelineDocument;
  /** `null` with no open setup, update or advise record. */
  readonly pipelineSetup:         BoardPipelineSetupDocument | null;
  /** `null` with neither a draft nor a readable pipeline to draw. */
  readonly pipelineFlow:          BoardPipelineFlowDocument | null;
  /** The newest profile run of each gate in each phase, of each entity on a forge over entities. */
  readonly profileRuns:           readonly BoardGateProfileRunDocument[];
  /** The cache mark of each gate in each phase whose newest run reported one. */
  readonly gateCacheMarks:        readonly BoardGateCacheMarkDocument[];
  /** The newest run time of each step line, for the pipeline overview. */
  readonly stepRunTimes:          readonly BoardPipelineStepRunTimeDocument[];
  /** The newest pipeline records, newest first. */
  readonly pipelineHistory:       readonly BoardPipelineHistoryEntryDocument[];
  readonly pipelineChoices:       BoardPipelineChoicesDocument;
  /** The pipeline agent's model and effort while no draft names them. */
  readonly pipelineAgentDefaults: AgentPairDocument;
  /** `null` until the first Apply over entities started a product owner to give committed tickets an entity. */
  readonly entityAssignment:      BoardEntityAssignmentDocument | null;
  /** `null` while no picture can be sent. */
  readonly pictureLimits:         BoardPictureLimitsDocument | null;
  readonly limits:                BoardLimitsDocument;
  /** The forge's open notices, each worded. */
  readonly notices:               readonly BoardNoticeDocument[];
  /** What the header warns of, derived from the notices and the forge's own facts, each worded. */
  readonly warnings:              readonly BoardNoticeDocument[];
  /** What waits on the user. */
  readonly attention:             readonly BoardAttentionEntryDocument[];
  readonly today:                 BoardTodayDocument;
  /** The open decisions in the order the user answers them: an agent's questions first. */
  readonly openDecisionIds:       readonly string[];
  /** The open decisions an Assistant put to the user unchanged. */
  readonly escalatedDecisionIds:  readonly string[];
}
