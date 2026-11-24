/**
 * The bounds and defaults a forge serves in its board's `limits`, with the values a forge serves today written out as Gaia's own: how a
 * view cuts stamps and lays out time, and the defaults its rules apply. Test-only.
 */
import type { BoardLimitsDocument } from '../../@types/board/BoardFactDocuments.ts';
import type { TimelineLimits }      from '../@types/Timeline.ts';
import type { TimestampSlices }     from '../utils/TimeUtil.ts';

export const EXAMPLE_BOARD_LIMITS: BoardLimitsDocument = {
  tickStepLadderMinutes:      [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440],
  maximumTicksPerAxis:        12,
  axisMinimumSpanMinutes:     60,
  axisPaddingMinutes:         15,
  minimumBarWidthPercent:     0.6,
  hoursAxisLabelLimitMinutes: 1440,
  weekAxisLabelLimitMinutes:  10_080,
  hourMinutes:                60,
  dayMinutes:                 1440,
  tickCountSafetyBound:       500,
  dateAndClockLength:         16,
  calendarDateLength:         10,
  monthAndDaySliceStart:      5,
  clockSliceStart:            11,
  clockSliceEnd:              16,
  concurrency:                { lowest: 1, ceiling: 12, defaultLimit: 4 },
  workerModel:                'opus',
  workerEffort:               'high',
  reworkRoundThresholdLines:  40,
  defaultTicketPriority:      'normal',
  firstRepeatReviewRound:     2,
  defaultInstructionsOfRole:  {
    productOwner:       [{ kind: 'default-brief', role: 'productOwner' }],
    specAgent:          [{ kind: 'constitution' }, { kind: 'default-brief', role: 'specAgent' }],
    planAgent:          [{ kind: 'constitution' }, { kind: 'default-brief', role: 'planAgent' }],
    builder:            [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }],
    reviewer:           [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }],
    reReviewer:         [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reReviewer' }],
    conflictReReviewer: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'conflictReReviewer' }],
    pipelineAgent:      [{ kind: 'default-brief', role: 'pipelineAgent' }],
    assistant:          [{ kind: 'default-brief', role: 'assistant' }],
  },
  reReviewThresholdStepLines: 10,
};

export const EXAMPLE_PAGE_LIMITS: Readonly<TimelineLimits & TimestampSlices> = EXAMPLE_BOARD_LIMITS;
