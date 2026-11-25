/**
 * The finished facts a forge serves its board with, as the page reads them, so no view recomputes a forge rule: what waits on the user,
 * the worded notices and warnings, today's figures, and the bounds and defaults the forge's rules apply.
 */
import type { BoardAgentPairDocument, BoardInstructionDocument } from './BoardPipelineDocuments.ts';
import type { BoardTargetDocument }                              from './BoardTargetDocument.ts';
import type {
  BoardAgentEffort,
  BoardAgentModel,
  BoardAttentionActionLabel,
  BoardAttentionKind,
  BoardAttentionStampWord,
  BoardDocumentReadingRule,
  BoardPipelineAgentRole,
  BoardPipelineApproval,
  BoardTicketDocumentKind,
  BoardTicketPriority,
  BoardTicketWritingRoute,
} from './BoardVocabulary.ts';

/** The roles that read a ticket's documents; a re-reviewer and a conflict re-reviewer read the reviewer's rules. */
export type BoardDocumentReadingRole = Extract<BoardPipelineAgentRole, 'builder' | 'reviewer'>;

/** One thing that waits on the user, worded by the forge, with what it opens. */
export interface BoardAttentionEntryDocument {
  readonly key:                     string;
  readonly kind:                    BoardAttentionKind;
  readonly idText:                  string;
  readonly ticketIds:               readonly string[];
  readonly subject:                 string;
  readonly jobId:                   string | null;
  readonly askedBy:                 string | null;
  readonly decisionKind:            string | null;
  readonly escalatedFromIncidentId: string | null;
  readonly metaText:                string | null;
  /** Empty when the forge does not hold it. */
  readonly stamp:                   string;
  readonly stampWord:               BoardAttentionStampWord;
  readonly actionLabel:             BoardAttentionActionLabel;
  readonly target:                  BoardTargetDocument;
}

/**
 * A notice or a warning: its kind, the facts it carries, the forge's sentence and, for an incident that took its default, why; a sentence that
 * names a command arrives in Gaia's words.
 */
export interface BoardNoticeDocument {
  readonly kind:      string;
  readonly facts:     Readonly<Record<string, unknown>>;
  readonly text:      string;
  readonly causeText: string | null;
}

/** Counted on `calendarDate`; shown only on that date. */
export interface BoardTodayDocument {
  readonly calendarDate:     string;
  readonly deliveredTickets: number;
  readonly tokens:           number;
}

export interface BoardConcurrencyBoundsDocument {
  readonly lowest:       number;
  readonly ceiling:      number;
  readonly defaultLimit: number;
}

/** How a view cuts and lays out time, and the bounds and defaults the forge's rules apply. */
export interface BoardLimitsDocument {
  readonly tickStepLadderMinutes:      readonly number[];
  readonly maximumTicksPerAxis:        number;
  readonly axisMinimumSpanMinutes:     number;
  readonly axisPaddingMinutes:         number;
  readonly minimumBarWidthPercent:     number;
  readonly hoursAxisLabelLimitMinutes: number;
  readonly weekAxisLabelLimitMinutes:  number;
  readonly hourMinutes:                number;
  readonly dayMinutes:                 number;
  readonly tickCountSafetyBound:       number;
  readonly dateAndClockLength:         number;
  readonly calendarDateLength:         number;
  readonly monthAndDaySliceStart:      number;
  readonly clockSliceStart:            number;
  readonly clockSliceEnd:              number;
  readonly concurrency:                BoardConcurrencyBoundsDocument;
  readonly workerModel:                BoardAgentModel;
  readonly workerEffort:               BoardAgentEffort;
  readonly reworkRoundThresholdLines:  number;
  readonly defaultTicketPriority:      BoardTicketPriority;
  readonly firstRepeatReviewRound:     number;
  readonly defaultInstructionsOfRole:  Readonly<Record<BoardPipelineAgentRole, readonly BoardInstructionDocument[]>>;
  readonly reReviewThresholdStepLines: number;
  /** The model and effort each role runs on where its pipeline names none. */
  readonly defaultAgentPairOfRole:     Readonly<Record<BoardPipelineAgentRole, BoardAgentPairDocument>>;
  /** Which version of each ticket document a role reads where its pipeline names no rule. */
  readonly defaultDocumentsOfRole:     Readonly<Record<BoardDocumentReadingRole, Readonly<Record<BoardTicketDocumentKind, BoardDocumentReadingRule>>>>;
  /** The documents a role reads at its default rule whatever its pipeline stores. */
  readonly fixedDocumentsOfRole:       Readonly<Record<BoardDocumentReadingRole, readonly BoardTicketDocumentKind[]>>;
  /** Whether each approval is on where the pipeline names none. */
  readonly defaultApprovals:           Readonly<Record<BoardPipelineApproval, boolean>>;
  /** The route a ticket is written by where the pipeline names none. */
  readonly defaultTicketWritingRoute:  BoardTicketWritingRoute;
}

/** What a message or an intake request may carry. */
export interface BoardPictureLimitsDocument {
  readonly perMessage:     number;
  readonly sizeLimitBytes: number;
  readonly mediaTypes:     readonly string[];
}
