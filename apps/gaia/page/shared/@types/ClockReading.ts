/** The page's clock as a model reads it: one reading and the time zone a clock time is printed in. */
export interface ClockReading {
  readonly nowEpochMilliseconds: number;
  readonly timeZone:             string | undefined;
}
