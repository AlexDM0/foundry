/**
 * Lay the bar: while the host walks Flint along a row, a bar grows behind it and one hand presses it down. In
 * milliseconds from the start of the cycle, and in sprite units for Flint facing right; negative x is behind Flint.
 */
export const LAY_BAR_TIMELINE = {
  CYCLE_MILLISECONDS:            1400,
  /** The bar fades out in the last moment of each cycle, then starts again. */
  FADE_OUT_MILLISECONDS:         200,
  /** Once in a cycle Flint looks back at the bar for this long. */
  LOOK_BACK_STARTS_MILLISECONDS: 800,
  LOOK_BACK_MILLISECONDS:        300,
  STILL_MOMENT_MILLISECONDS:     700,
} as const;

/** The row line behind and ahead of Flint, and the bar that grows behind it: `MINIMUM + GROWTH × p²` long. */
export const LAY_BAR_SHAPE = {
  ROW_START_X_UNITS:        -50,
  ROW_END_X_UNITS:          30,
  ROW_Y_UNITS:              3,
  ROW_STROKE_UNITS:         0.6,
  ROW_OPACITY:              0.3,
  BAR_END_X_UNITS:          -18,
  BAR_Y_UNITS:              -4,
  BAR_HEIGHT_UNITS:         6,
  BAR_CORNER_RADIUS_UNITS:  3,
  BAR_MINIMUM_LENGTH_UNITS: 10,
  BAR_GROWTH_UNITS:         26,
  /** The end of the bar nearest Flint is in the body colour. */
  BAR_HEAD_LENGTH_UNITS:    6,
} as const;

/**
 * One square behind Flint presses the bar each `PRESS_INTERVAL_MILLISECONDS`: down by `PRESS_DEPTH_UNITS` and back. The design puts it at
 * (-10, -8), 2 units clear of the bar's end at x -18; it stands over the bar's head instead, its lower corner 1 above the bar's top, a
 * builder decision, so that each press goes into the bar.
 */
export const LAY_BAR_HAND = {
  RADIUS_UNITS:                6,
  TURN_DEGREES:                0,
  CENTRE_X_UNITS:              -21,
  CENTRE_Y_UNITS:              -11,
  PRESS_INTERVAL_MILLISECONDS: 350,
  PRESS_MILLISECONDS:          120,
  PRESS_DEPTH_UNITS:           3,
} as const;

export const LAY_BAR_EYES = {
  HEIGHT_UNITS:          6,
  LOOK_BACK_SHIFT_UNITS: -2,
} as const;
