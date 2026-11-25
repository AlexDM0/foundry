/**
 * The board document's `limits`: how a view cuts a stamp into its parts, counts a duration, and lays out the progress chart's axis, and the
 * bounds and defaults forge's rules apply, so a view keeps no copy of these figures.
 */
import type {
  AgentEffort,
  AgentModel,
  DocumentReadingRule,
  PipelineAgentRole,
  TicketDocumentKind,
  TicketPriority,
  TicketWritingRoute
} from '../constants/BoardVocabulary.ts';
import type { AgentPairDocument, InstructionEntryDocument, PipelineApproval } from './BoardPipelineDocuments.ts';

/** The roles that read a ticket's documents; a re-reviewer and a conflict re-reviewer read the reviewer's rules. */
export type DocumentReadingRole = Extract<PipelineAgentRole, 'builder' | 'reviewer'>;

/** The fewest and the most agents a board's concurrency limit may allow, and the limit of a board that never set one. */
export interface BoardConcurrencyBoundsDocument {
  readonly lowest:  number;
  readonly ceiling: number;
  readonly default: number;
}

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
  /** The model and effort of every agent but the pipeline agent where the pipeline names none. */
  readonly workerModel:                AgentModel;
  readonly workerEffort:               AgentEffort;
  /** A review round that changes more lines than this is no longer converging. */
  readonly reworkRoundThresholdLines:  number;
  readonly defaultTicketPriority:      TicketPriority;
  /** The round a row reaches the first time its ticket is reviewed again; the first pass counts no round. */
  readonly firstRepeatReviewRound:     number;
  /** The instruction list a role reads where its pipeline names none. */
  readonly defaultInstructionsOfRole:  Readonly<Record<PipelineAgentRole, readonly InstructionEntryDocument[]>>;
  /** The step of a re-review threshold, also its lowest value. */
  readonly reReviewThresholdStepLines: number;
  /** The model and effort each role runs on where its pipeline names none. */
  readonly defaultAgentPairOfRole:     Readonly<Record<PipelineAgentRole, AgentPairDocument>>;
  /** Which version of each ticket document a role reads where its pipeline names no rule. */
  readonly defaultDocumentsOfRole:     Readonly<Record<DocumentReadingRole, Readonly<Record<TicketDocumentKind, DocumentReadingRule>>>>;
  /** The documents a role reads at its default rule whatever its pipeline stores: the reviewer's spec. */
  readonly fixedDocumentsOfRole:       Readonly<Record<DocumentReadingRole, readonly TicketDocumentKind[]>>;
  /** Whether each approval is on where the pipeline names none. */
  readonly defaultApprovals:           Readonly<Record<PipelineApproval, boolean>>;
  /** The route a ticket is written by where the pipeline names none. */
  readonly defaultTicketWritingRoute:  TicketWritingRoute;
}
