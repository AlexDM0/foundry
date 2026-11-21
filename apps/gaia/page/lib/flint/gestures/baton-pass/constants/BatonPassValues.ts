/** Baton pass of `06-more-animations.md`: a new generation of the Overseer, in one action; in sprite units, for Flint facing right. */
export const BATON_PASS_TIMELINE = {
  DURATION_MILLISECONDS:       2600,
  TOSS_STARTS_MILLISECONDS:    300,
  TOSS_ENDS_MILLISECONDS:      700,
  OUTLINE_STARTS_MILLISECONDS: 950,
  FALL_STARTS_MILLISECONDS:    1100,
  RETURN_MILLISECONDS:         1300,
  HAND_RETURNS_MILLISECONDS:   1350,
  CATCH_MILLISECONDS:          1500,
  SQUASH_MILLISECONDS:         120,
  HOP_MILLISECONDS:            300,
  AFTERGLOW_ENDS_MILLISECONDS: 1800,
  HAPPY_ENDS_MILLISECONDS:     2200,
  STILL_MOMENT_MILLISECONDS:   1700,
} as const;

/** The fill opacity of each step of the flicker, set at once at its moment; only the outline shows after the last. */
export const BATON_PASS_FLICKER = [
  { MOMENT_MILLISECONDS: 500, FILL_OPACITY: 1 },
  { MOMENT_MILLISECONDS: 650, FILL_OPACITY: 0.2 },
  { MOMENT_MILLISECONDS: 800, FILL_OPACITY: 0.8 },
  { MOMENT_MILLISECONDS: BATON_PASS_TIMELINE.OUTLINE_STARTS_MILLISECONDS, FILL_OPACITY: 0 },
] as const;

/**
 * The hand holds the baton upright at its lower end; the baton is tossed up with a turn, decelerating, and falls back with `p²`. Flint
 * watches the tossed baton with its eyes up, as it follows the spark of Strike a spark.
 */
export const BATON_PASS_MOTION = {
  HAND_CORNER_COUNT:        5,
  HAND_RADIUS_UNITS:        6,
  HAND_CENTRE_X_UNITS:      28,
  HAND_CENTRE_Y_UNITS:      -26,
  BATON_CENTRE_X_UNITS:     28,
  HELD_CENTRE_Y_UNITS:      -34,
  TOSSED_CENTRE_Y_UNITS:    -66,
  TOSS_TURN_DEGREES:        360,
  WORKING_EYE_SHIFT_UNITS:  6,
  WATCHING_EYE_LIFT_UNITS:  -3,
  OUTLINE_EYE_HEIGHT_UNITS: 1,
  RETURN_EYE_HEIGHT_UNITS:  10,
  RETURN_TINT_AMOUNT:       0.8,
  RETURN_GLOW_OPACITY:      0.6,
  HOP_UNITS:                5,
  CATCH_WIDTH_FACTOR:       1.05,
  CATCH_HEIGHT_FACTOR:      0.95,
} as const;

/** The baton: an upright bar with a band at each end, over a soft round glow. */
export const BATON_SHAPE = {
  WIDTH_UNITS:         4,
  HEIGHT_UNITS:        14,
  CORNER_RADIUS_UNITS: 2,
  BAND_HEIGHT_UNITS:   3,
  GLOW_RADIUS_UNITS:   6,
  GLOW_OPACITY:        0.4,
} as const;
