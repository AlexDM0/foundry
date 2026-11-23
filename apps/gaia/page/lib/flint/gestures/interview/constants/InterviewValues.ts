/** Interview: two rounds of asking, listening and writing, then an end; in milliseconds from the loop's start. */
export const INTERVIEW_TIMELINE = {
  CYCLE_MILLISECONDS:             5600,
  ROUND_MILLISECONDS:             2200,
  ROUND_COUNT:                    2,
  /** Within a round. */
  ASKING_ENDS_MILLISECONDS:       800,
  LISTENING_ENDS_MILLISECONDS:    1500,
  /** From the loop's start: once both rounds are done. */
  END_STARTS_MILLISECONDS:        4400,
  HAPPY_ENDS_MILLISECONDS:        5000,
  LINES_FADE_STARTS_MILLISECONDS: 5000,
  /** Reduced motion holds the pen in the middle of the first line. */
  STILL_MOMENT_MILLISECONDS:      1800,
} as const;

/** Flint asks the user: it faces the user, with one eye narrower, and the question mark shows. */
export const INTERVIEW_ASKING = {
  LEAN_DEGREES:           3,
  EYE_SHIFT_UNITS:        0,
  EYE_HEIGHT_UNITS:       8,
  RIGHT_EYE_HEIGHT_UNITS: 6,
} as const;

/** A nod: the lean goes from 0 to `LEAN_DEGREES` and back in one nod's time. */
export const INTERVIEW_NOD = {
  MILLISECONDS:     350,
  LEAN_DEGREES:     6,
  EYE_HEIGHT_UNITS: 6,
  EYE_SHIFT_UNITS:  0,
} as const;

/** The notepad of research, its lines written at the pace of the notes study; the tick floats above it. */
export const INTERVIEW_NOTEPAD = {
  LINE_MILLISECONDS:  700,
  TICK_START_X_UNITS: 40,
  TICK_START_Y_UNITS: -50,
} as const;
