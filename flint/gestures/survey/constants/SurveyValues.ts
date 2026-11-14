/**
 * Survey of `06-more-animations.md`: the onboarder reads a repository and proposes a pipeline. Flint measures a blueprint, thinks, sets
 * three posts with lamps, and the lamps pass. In milliseconds from the start of the cycle, and in sprite units for Flint facing right.
 */
export const SURVEY_TIMELINE = {
  CYCLE_MILLISECONDS:               5600,
  FADE_IN_MILLISECONDS:             300,
  TOP_MEASURE_STARTS_MILLISECONDS:  300,
  SIDE_MEASURE_STARTS_MILLISECONDS: 900,
  THINKING_STARTS_MILLISECONDS:     1500,
  POSTS_START_MILLISECONDS:         2100,
  POST_MILLISECONDS:                600,
  LAMPS_PASS_MILLISECONDS:          3900,
  /** Lamp n passes this long after lamp n - 1. */
  LAMP_INTERVAL_MILLISECONDS:       120,
  FADES_OUT_MILLISECONDS:           5000,
  /** Reduced motion holds the three posts with their lamps passed. */
  STILL_MOMENT_MILLISECONDS:        4200,
} as const;

/** The blueprint: the paper polygon in the `water` colour, divided in thirds by two lines across and two lines down. */
export const BLUEPRINT_SHAPE = {
  FILL_OPACITY:      0.25,
  STROKE_UNITS:      1.2,
  GRID_DIVISIONS:    3,
  GRID_OPACITY:      0.6,
  GRID_STROKE_UNITS: 0.6,
} as const;

/**
 * Two measure lines with an end mark of 2 at each end: one along the slope of the paper, one straight down. The handoff puts the second at
 * x 33, on post 0, where the post and its lamp vanish into it; it runs at x 30, 2 in from the paper's left edge, a builder decision.
 */
export const SURVEY_MEASURE = {
  STROKE_UNITS:       1.2,
  END_MARK_UNITS:     2,
  TOP_START_X_UNITS:  31,
  TOP_START_Y_UNITS:  -38,
  TOP_LENGTH_UNITS:   14,
  SIDE_X_UNITS:       30,
  SIDE_START_Y_UNITS: -34,
  SIDE_END_Y_UNITS:   -18,
} as const;

/**
 * Three posts on the line `y = BASE_Y_UNITS + slope × (x - BASE_ORIGIN_X_UNITS)`, each growing to its height with a lamp on top. The lamp
 * is the shared lamp of 2.2, not the handoff's 1.6, which cannot be read at 0.5 pixels for one unit, a builder decision.
 */
export const SURVEY_POSTS = {
  X_UNITS:             [33, 38, 43],
  BASE_Y_UNITS:        -20,
  BASE_ORIGIN_X_UNITS: 31,
  BASE_SLOPE:          0.2,
  HEIGHT_UNITS:        5,
  STROKE_UNITS:        1.2,
} as const;

/**
 * The hand: a triangle of 6 that points down along the top edge and points forward down the left edge, then a hexagon of 5.5 that goes 5
 * down above each post in the first half of the post's time, and back up in the second.
 */
export const SURVEY_HAND = {
  MEASURE_RADIUS_UNITS:   6,
  ALONG_TOP_TURN_DEGREES: 180,
  DOWN_SIDE_TURN_DEGREES: 90,
  TOP_START_X_UNITS:      31,
  TOP_START_Y_UNITS:      -49,
  TOP_END_X_UNITS:        45,
  TOP_END_Y_UNITS:        -46,
  SIDE_X_UNITS:           25,
  /** Down the side the triangle is 5, not 6, so its corners stay off the leaned body; its tip then points at the side measure. */
  SIDE_RADIUS_UNITS:      5,
  SIDE_START_Y_UNITS:     -34,
  SIDE_END_Y_UNITS:       -18,
  POST_RADIUS_UNITS:      5.5,
  PRESS_UNITS:            5,
} as const;

/** Eye height 5 while Flint measures; the eyes follow the hand with the lift of the pen, `clamp((y + 28) / divisor, lowest, highest)`. */
export const SURVEY_EYES = {
  MEASURE_HEIGHT_UNITS: 5,
  HEIGHT_UNITS:         6,
  THINKING_LIFT_UNITS:  -3,
  LIFT_CENTRE_Y_UNITS:  -28,
  LIFT_DIVISOR_UNITS:   5,
  LIFT_LOWEST_UNITS:    -3,
  LIFT_HIGHEST_UNITS:   3,
} as const;
