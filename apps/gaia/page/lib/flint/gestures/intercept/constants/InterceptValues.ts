import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/**
 * Assistant intercept: an incident goes to the Assistant before it goes to the user. The cycles alternate
 * between the two outcomes, handled first. In sprite units, for Flint facing right; the envelope is placed by its top left corner.
 */
export const INTERCEPT_TIMELINE = {
  CYCLE_MILLISECONDS:           3800,
  /** The envelope fades in as it flies in, so it never shows at once at the start of a cycle. */
  FADE_IN_MILLISECONDS:         300,
  REACH_STARTS_MILLISECONDS:    450,
  CATCH_MILLISECONDS:           700,
  HOP_MILLISECONDS:             300,
  FAR_HAND_LEAVES_MILLISECONDS: 850,
  PULLED_MILLISECONDS:          1000,
  FLAP_OPEN_MILLISECONDS:       1250,
  PAPER_RISEN_MILLISECONDS:     1500,
  READING_ENDS_MILLISECONDS:    2200,
  /** Handled: the paper goes back, then the envelope goes into Flint. */
  PAPER_BACK_MILLISECONDS:      2500,
  TUCKED_MILLISECONDS:          3000,
  /** Passed up: the hand lifts the envelope, then it flies up alone. */
  LIFTED_MILLISECONDS:          2700,
  OUTCOME_ENDS_MILLISECONDS:    3200,
  STILL_MOMENT_MILLISECONDS:    1500,
} as const;

export const INTERCEPT_ENVELOPE = {
  FLIGHT_START_X_UNITS: 36,
  FLIGHT_START_Y_UNITS: -20,
  CATCH_X_UNITS:        30,
  CATCH_Y_UNITS:        -38,
  FLIGHT_TURN_DEGREES:  -20,
  HELD_X_UNITS:         28,
  HELD_Y_UNITS:         -30,
  TUCKED_X_UNITS:       10,
  TUCKED_Y_UNITS:       -22,
  LIFTED_Y_UNITS:       -44,
  FLOWN_Y_UNITS:        -50,
  TICK_START_X_UNITS:   30,
  TICK_START_Y_UNITS:   -48,
} as const;

/**
 * Two pentagons reach for the flying envelope, as the hands of Grab, their spread closing from 9 to 4: the far hand at its upper right,
 * the near hand coming in at its lower corner, so that it holds that corner at the catch. The grip is a fixed offset from the top left
 * corner.
 */
export const INTERCEPT_HANDS = {
  CORNER_COUNT:             5,
  NEAR_RADIUS_UNITS:        7,
  FAR_RADIUS_UNITS:         6.3,
  SPREAD_X:                 0.7,
  SPREAD_Y:                 0.5,
  OPEN_SPREAD_UNITS:        9,
  CLOSED_SPREAD_UNITS:      4,
  GRIP_FROM_CORNER_X_UNITS: -4,
  GRIP_FROM_CORNER_Y_UNITS: 6,
} as const;

export const INTERCEPT_EYES = {
  CATCHING_HEIGHT_UNITS:              10,
  READING_HEIGHT_UNITS:               5,
  READING_LIFT_UNITS:                 1,
  READING_SHIFT_UNITS:                6,
  /** The reading eyes move by `sin(t / READING_SHIFT_DIVISOR_MILLISECONDS)`. */
  READING_SHIFT_DIVISOR_MILLISECONDS: 150,
  PASSED_UP_LIFT_UNITS:               -3,
} as const;

/** The hop of the catch. */
export const INTERCEPT_BODY = { HOP_UNITS: 4 } as const;

/** The flap folds from down to up as it opens; the paper inside it is smaller than the envelope and rises out of its top. */
export const INTERCEPT_LETTER_SHAPE = {
  CLOSED_FLAP_DEPTH_UNITS: 5,
  OPEN_FLAP_DEPTH_UNITS:   -5,
  PAPER_WIDTH_UNITS:       10,
  PAPER_HEIGHT_UNITS:      8,
  PAPER_INSET_X_UNITS:     2,
  PAPER_INSET_Y_UNITS:     1,
  PAPER_RISE_UNITS:        6,
  PAPER_STROKE_UNITS:      0.8,
  LINE_INSET_X_UNITS:      2,
  LINE_Y_UNITS:            [2.5, 5],
  LINE_STROKE_UNITS:       1,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const INTERCEPT_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      52,
  aboveFloorUnits: 63.5,
  belowFloorUnits: -3,
};
