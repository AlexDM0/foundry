/**
 * Wind-down: Flint types slower, turns a dial down in three steps, and writes one last
 * line on a ticket, in one action; in sprite units, for Flint facing right, and milliseconds; `sin(t / n)` names `n` a divisor.
 */
export const WIND_DOWN = {
  DURATION_MILLISECONDS:     3200,
  STILL_MOMENT_MILLISECONDS: 1500,
} as const;

/** Typing in the normal mood, but slow: the tap's divisor before the first step, then after each step; after the last step it stops. */
export const SLOW_TYPING = {
  TAP_DIVISORS_MILLISECONDS: [120, 200, 320],
  EYE_HEIGHT_UNITS:          6,
  EYE_LIFT_UNITS:            2,
} as const;

/** The dial: a ring with a pointer square on it; the pointer's angle is 0 forward and negative up. */
export const DIAL = {
  CENTRE_X_UNITS:               40,
  CENTRE_Y_UNITS:               -40,
  RING_RADIUS_UNITS:            9.5,
  RING_STROKE_UNITS:            1.4,
  POINTER_SIDE_UNITS:           3,
  POINTER_START_DEGREES:        60,
  FADE_IN_STARTS_MILLISECONDS:  500,
  FADE_IN_ENDS_MILLISECONDS:    700,
  FADE_OUT_STARTS_MILLISECONDS: 1700,
  FADE_OUT_ENDS_MILLISECONDS:   2100,
} as const;

/** Three steps from 700: in each the hand and the pointer turn by STEP_DEGREES in TURN_MILLISECONDS, then wait. */
export const DIAL_STEPS = {
  STARTS_MILLISECONDS: 700,
  STEP_MILLISECONDS:   330,
  TURN_MILLISECONDS:   200,
  STEP_DEGREES:        -60,
  COUNT:               3,
  HAND_RADIUS_UNITS:   6.5,
  /** The eye height of each step. */
  EYE_HEIGHTS_UNITS:   [6, 5, 4],
} as const;

/** The ticket at 80% around the paper's centre: three printed lines, and one more line that the pen writes. */
export const LAST_TICKET = {
  SCALE:                       0.8,
  FADE_IN_STARTS_MILLISECONDS: 2100,
  FADE_IN_ENDS_MILLISECONDS:   2400,
  WRITING_STARTS_MILLISECONDS: 2300,
  WRITING_MILLISECONDS:        600,
  LINE_START_X_UNITS:          31,
  PRINTED_LINE_Y_UNITS:        [-34, -28, -22],
  /** The next line of the ticket text, 6 below the last printed one. */
  WRITTEN_LINE_Y_UNITS:        -16,
  FULL_LINE_UNITS:             12,
  LEAVES_MILLISECONDS:         2900,
  LEAVE_X_UNITS:               14,
  LEAVE_Y_UNITS:               -6,
  LEAVING_EYE_HEIGHT_UNITS:    3,
} as const;
