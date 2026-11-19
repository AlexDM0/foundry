/**
 * The board document's `limits`: how a view cuts a stamp into its parts, counts a duration, and lays out the progress chart's axis, so a
 * view keeps no copy of these figures.
 */

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
}
