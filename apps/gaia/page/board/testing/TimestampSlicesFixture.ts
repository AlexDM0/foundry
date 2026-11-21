/** The stamp slices and duration units of a board's `limits`, as the board fixture's limits serve them. Test-only. */
import type { DurationUnits, TimestampSlices } from '../utils/TimeUtil.ts';
import { EXAMPLE_BOARD_LIMITS }                from './PageLimitsFixture.ts';

export const EXAMPLE_TIMESTAMP_SLICES: Readonly<TimestampSlices> = Object.freeze({
  dateAndClockLength:    EXAMPLE_BOARD_LIMITS.dateAndClockLength,
  calendarDateLength:    EXAMPLE_BOARD_LIMITS.calendarDateLength,
  monthAndDaySliceStart: EXAMPLE_BOARD_LIMITS.monthAndDaySliceStart,
  clockSliceStart:       EXAMPLE_BOARD_LIMITS.clockSliceStart,
  clockSliceEnd:         EXAMPLE_BOARD_LIMITS.clockSliceEnd,
});

export const EXAMPLE_PAGE_LIMITS: Readonly<TimestampSlices & DurationUnits> = Object.freeze({
  ...EXAMPLE_TIMESTAMP_SLICES,
  hourMinutes: EXAMPLE_BOARD_LIMITS.hourMinutes,
  dayMinutes:  EXAMPLE_BOARD_LIMITS.dayMinutes,
});
