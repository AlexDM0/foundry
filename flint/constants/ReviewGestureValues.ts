/**
 * Review of `02-animations.md`: the lens moves along the line Flint reads, `along` from 0 to 1 per line; the line positions are the
 * sheet's of `flint/constants/PropShapes.ts`.
 */
export const REVIEW_GESTURE_VALUES = {
  LENS_START_X_UNITS:        31,
  LENS_TRAVEL_UNITS:         13,
  LENS_BELOW_LINE_UNITS:     1,
  HAND_RADIUS_UNITS:         5,
  HAND_TURN_DEGREES:         0,
  EYE_LIFT_FIRST_LINE_UNITS: -2,
  EYE_LIFT_PER_LINE_UNITS:   1.4,
  EYE_SHIFT_START_UNITS:     5,
  EYE_SHIFT_TRAVEL_UNITS:    2,
  /** The normal mood's cross. */
  CROSS_EYE_HEIGHT_UNITS:    4,
  CROSS_LEAN_DEGREES:        9,
  /** The busy mood's verdict lifts the sheet by `PAGE_TURN_RISE_UNITS × sin(π × verdict progress)`. */
  PAGE_TURN_RISE_UNITS:      6,
} as const;

/** The angry jab `JAB_UNITS × max(0, sin(t / divisor))` comes off the lens's x and y; the sheet moves down by its share of it. */
export const REVIEW_JAB = {
  JAB_UNITS:                3,
  JAB_DIVISOR_MILLISECONDS: 45,
  SHEET_SHARE:              0.5,
} as const;

/** Per mood: the time to read one line, the time of the verdict, and the pages behind the sheet. */
export const REVIEW_PACES = {
  normal: { LINE_MILLISECONDS: 800, VERDICT_MILLISECONDS: 800, STACKED_PAGE_COUNT: 0 },
  busy:   { LINE_MILLISECONDS: 280, VERDICT_MILLISECONDS: 350, STACKED_PAGE_COUNT: 1 },
  angry:  { LINE_MILLISECONDS: 500, VERDICT_MILLISECONDS: 900, STACKED_PAGE_COUNT: 3 },
} as const;
