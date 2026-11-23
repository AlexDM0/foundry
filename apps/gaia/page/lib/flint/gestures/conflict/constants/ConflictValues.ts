/**
 * Conflict: Merge with one more step, in milliseconds and sprite units, for Flint facing right. The blocks, the
 * hands, the snap and the leave are the shared press (`flint/gestures/constants/BlockPress.ts`); these are the values Conflict adds.
 */
export const CONFLICT_TIMELINE = {
  CYCLE_MILLISECONDS:              3600,
  FADE_IN_MILLISECONDS:            300,
  FIRST_PRESS_STARTS_MILLISECONDS: 300,
  HIT_MILLISECONDS:                700,
  SHAKE_MILLISECONDS:              100,
  IMPACT_LINES_MILLISECONDS:       300,
  APART_MILLISECONDS:              1000,
  /** The file comes out of the body before its first stroke, so it starts the stroke in place. */
  FILE_APPEARS_MILLISECONDS:       850,
  FILING_STARTS_MILLISECONDS:      1000,
  STROKE_MILLISECONDS:             400,
  FILING_ENDS_MILLISECONDS:        2200,
  SNAP_MILLISECONDS:               2600,
  /** Merge's squash, from its snap at 900 to 1100. */
  SQUASH_MILLISECONDS:             200,
  LEAVES_MILLISECONDS:             3000,
  /** Reduced motion holds the merged block with its tick and the happy eyes. */
  STILL_MOMENT_MILLISECONDS:       2800,
} as const;

/**
 * The travel of each block towards the other. At the hit the tips of the teeth touch: with teeth of 2 on each block and 16 between the
 * blocks at rest, that is a travel of 6.
 */
export const CONFLICT_PRESS = {
  HIT_TRAVEL_UNITS:           6,
  APART_TRAVEL_UNITS:         2,
  FIT_TRAVEL_UNITS:           8,
  /** Both blocks shake by `SHAKE_UNITS × sin(t / SHAKE_DIVISOR_MILLISECONDS)`, the shake of an angry mood, from the hit. */
  SHAKE_UNITS:                0.8,
  SHAKE_DIVISOR_MILLISECONDS: 28,
  HIT_SLANT_DEGREES:          10,
  FILING_EYE_HEIGHT_UNITS:    5,
} as const;

/**
 * Two teeth on the edge of each block that faces the other block, placed by their centres: once the file has moved the teeth of the top
 * block over by 3, the four teeth alternate edge to edge across the seam.
 */
export const CONFLICT_TEETH = {
  WIDTH_UNITS:       3,
  HEIGHT_UNITS:      2,
  BOTTOM_X_UNITS:    [30, 36],
  TOP_START_X_UNITS: [30, 36],
  TOP_FILED_X_UNITS: [33, 39],
} as const;

/** The two short crimson lines at the sides of the seam when the teeth hit; the knock arcs' width. */
export const CONFLICT_IMPACT_LINES = {
  LEFT_START_X_UNITS:  26,
  RIGHT_START_X_UNITS: 42,
  LENGTH_UNITS:        4,
  STROKE_UNITS:        1,
} as const;

/** One triangle files the lower edge of the top block, forward and back in each stroke. */
export const CONFLICT_FILE = {
  RADIUS_UNITS:  5.5,
  TURN_DEGREES:  90,
  Y_UNITS:       -31,
  START_X_UNITS: 26,
  END_X_UNITS:   42,
  STROKE_COUNT:  3,
} as const;

/** Each stroke drops two shavings where the file is at these shares of the stroke; each falls with `p²` and fades. */
export const CONFLICT_SHAVINGS = {
  SIDE_UNITS:             1.2,
  BIRTH_STROKE_FRACTIONS: [0.2, 0.65],
  FALL_UNITS:             8,
  FALL_MILLISECONDS:      300,
} as const;
