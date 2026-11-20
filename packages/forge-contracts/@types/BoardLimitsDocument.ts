/**
 * The board document's `limits`: how a view cuts a stamp into its parts, counts a duration, and lays out the progress chart's axis, and the
 * bounds and defaults forge's rules apply, so a view keeps no copy of these figures.
 */
import type {
  AgentEffort,
  AgentModel,
  PipelineAgentRole,
  TicketPriority
} from '../constants/BoardVocabulary.ts';
import type { InstructionEntryDocument } from './BoardPipelineDocuments.ts';

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
}
