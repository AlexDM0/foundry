/**
 * One forge's board as Gaia serves it to its page (`GET /api/v1/forges/<trackerId>/board`): field for field what a view of the board reads
 * and the facts the forge serves, under Gaia's names and Gaia's unions. Gaia's own contract, never the forge's (decision 51).
 */
import type { PAGE_CONTRACT_VERSIONS }                                   from '../../../src/shared/constants/PageContractVersions.ts';
import type { BoardAgentDocument }                                       from './BoardAgentDocuments.ts';
import type { BoardDecisionDocument, BoardQuestionHistoryEntryDocument } from './BoardDecisionDocuments.ts';
import type {
  BoardAttentionEntryDocument,
  BoardLimitsDocument,
  BoardNoticeDocument,
  BoardPictureLimitsDocument,
  BoardTodayDocument
} from './BoardFactDocuments.ts';
import type { BoardIncidentDocument } from './BoardIncidentDocument.ts';
import type {
  BoardEndedJobDocument,
  BoardJobDocument,
  BoardMergeQueueDocument,
  BoardTicketForecastDocument
} from './BoardJobDocuments.ts';
import type { BoardPipelineFactsDocument } from './BoardPipelineDocuments.ts';
import type { BoardPageDocument }          from './BoardTicketDocuments.ts';
import type { BoardHephaestusState }       from './BoardVocabulary.ts';

export interface BoardHephaestusDocument {
  readonly state:       BoardHephaestusState;
  readonly paused:      boolean;
  readonly codeVersion: string;
}

export interface BoardConcurrencyDocument {
  readonly limit:          number;
  readonly agentsInFlight: number;
}

export interface BoardLaunchSlotsDocument {
  readonly limit:                         number;
  readonly slotJobIds:                    readonly string[];
  readonly inProgressTicketIdsWithoutJob: readonly string[];
}

export interface BoardUsageWindowDocument {
  /** The window's name as the agent reported it, worded only when its length is unknown. */
  readonly window:      string;
  readonly lengthHours: number | null;
  /** Percent of the window used, 0 to 100. */
  readonly utilization: number;
  readonly resetsAt:    string;
}

export interface BoardUsageDocument {
  readonly resetsAt: string | null;
  readonly window:   string | null;
  readonly windows:  readonly BoardUsageWindowDocument[];
}

export interface BoardDocument {
  readonly boardVersion:         typeof PAGE_CONTRACT_VERSIONS.gaiaBoard;
  readonly trackerId:            string;
  readonly project:              string;
  readonly hephaestus:           BoardHephaestusDocument;
  readonly concurrency:          BoardConcurrencyDocument;
  readonly launchSlots:          BoardLaunchSlotsDocument;
  readonly usage:                BoardUsageDocument;
  readonly page:                 BoardPageDocument;
  readonly mergeQueue:           BoardMergeQueueDocument;
  readonly jobs:                 readonly BoardJobDocument[];
  readonly endedJobs:            readonly BoardEndedJobDocument[];
  /** In opening order; `openDecisionIds` holds the order the user answers them in. */
  readonly decisions:            readonly BoardDecisionDocument[];
  readonly incidents:            readonly BoardIncidentDocument[];
  readonly questionHistory:      readonly BoardQuestionHistoryEntryDocument[];
  readonly ticketForecasts:      readonly BoardTicketForecastDocument[];
  readonly pipeline:             BoardPipelineFactsDocument;
  /** The board's Assistant switch as the forge holds it: off until the board turns it on, and off while no readable pipeline is stored. */
  readonly assistantIsOn:        boolean;
  readonly agent:                BoardAgentDocument;
  readonly pictureLimits:        BoardPictureLimitsDocument | null;
  readonly limits:               BoardLimitsDocument;
  readonly notices:              readonly BoardNoticeDocument[];
  readonly warnings:             readonly BoardNoticeDocument[];
  readonly attention:            readonly BoardAttentionEntryDocument[];
  readonly today:                BoardTodayDocument;
  readonly openDecisionIds:      readonly string[];
  readonly escalatedDecisionIds: readonly string[];
}
