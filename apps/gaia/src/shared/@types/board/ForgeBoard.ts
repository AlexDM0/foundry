/**
 * Gaia's model of one forge's board: the last board document read from that forge, mapped in at the boundary, held per forge and never
 * written back to a forge or a file (decision 47). It holds what a view of the board reads and the facts the forge serves, nothing else.
 */
import type { BoardDecision, BoardQuestionHistoryEntry } from './BoardDecision.ts';
import type {
  BoardAttentionEntry,
  BoardLimits,
  BoardNotice,
  BoardPictureLimits,
  BoardToday
} from './BoardFacts.ts';
import type { BoardIncident } from './BoardIncident.ts';
import type {
  BoardEndedJob,
  BoardJob,
  BoardMergeQueue,
  BoardTicketForecast
} from './BoardJob.ts';
import type { BoardPipelineFacts } from './BoardPipeline.ts';
import type { BoardPage }          from './BoardTicket.ts';
import type { BoardOverseerState } from './BoardVocabulary.ts';

export interface BoardOverseer {
  readonly state:       BoardOverseerState;
  readonly paused:      boolean;
  readonly codeVersion: string;
}

export interface BoardConcurrency {
  readonly limit:          number;
  readonly agentsInFlight: number;
}

export interface BoardLaunchSlots {
  readonly limit:                         number;
  readonly slotJobIds:                    readonly string[];
  readonly inProgressTicketIdsWithoutJob: readonly string[];
}

export interface BoardUsageWindow {
  /** The window's name as the agent reported it, worded only when its length is unknown. */
  readonly window:      string;
  readonly lengthHours: number | null;
  /** Percent of the window used, 0 to 100. */
  readonly utilization: number;
  readonly resetsAt:    string;
}

export interface BoardUsage {
  readonly resetsAt: string | null;
  readonly window:   string | null;
  readonly windows:  readonly BoardUsageWindow[];
}

export interface ForgeBoard {
  readonly trackerId:            string;
  readonly project:              string;
  readonly overseer:             BoardOverseer;
  readonly concurrency:          BoardConcurrency;
  readonly launchSlots:          BoardLaunchSlots;
  readonly usage:                BoardUsage;
  readonly page:                 BoardPage;
  readonly mergeQueue:           BoardMergeQueue;
  readonly jobs:                 readonly BoardJob[];
  readonly endedJobs:            readonly BoardEndedJob[];
  /** In opening order; `openDecisionIds` holds the order the user answers them in. */
  readonly decisions:            readonly BoardDecision[];
  readonly incidents:            readonly BoardIncident[];
  readonly questionHistory:      readonly BoardQuestionHistoryEntry[];
  readonly ticketForecasts:      readonly BoardTicketForecast[];
  readonly pipeline:             BoardPipelineFacts;
  /** The board's Assistant switch as the forge holds it: off until the board turns it on, and off while no readable pipeline is stored. */
  readonly assistantIsOn:        boolean;
  readonly pictureLimits:        BoardPictureLimits | null;
  readonly limits:               BoardLimits;
  readonly notices:              readonly BoardNotice[];
  readonly warnings:             readonly BoardNotice[];
  readonly attention:            readonly BoardAttentionEntry[];
  readonly today:                BoardToday;
  readonly openDecisionIds:      readonly string[];
  readonly escalatedDecisionIds: readonly string[];
}
