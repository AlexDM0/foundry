/** Strike a spark of `06-more-animations.md`: one action, in milliseconds and sprite units, for Flint facing right. */
export const STRIKE_SPARK_TIMELINE = {
  DURATION_MILLISECONDS:           1500,
  STRIKE_STARTS_MILLISECONDS:      250,
  STRUCK_MILLISECONDS:             330,
  SQUASH_MILLISECONDS:             120,
  GLOW_ENDS_MILLISECONDS:          700,
  WATCHER_ARRIVES_MILLISECONDS:    800,
  HAPPY_EYES_MILLISECONDS:         900,
  WATCHER_FADE_MILLISECONDS:       200,
  SMALL_SPARK_FLIGHT_MILLISECONDS: 400,
  /** Reduced motion holds the Watcher in its place, the hand gone and the happy eyes. */
  STILL_MOMENT_MILLISECONDS:       900,
} as const;

/** The square that strikes: it rises above the body, then runs down along its edge. */
export const STRIKE_HAND = {
  RADIUS_UNITS:   6.5,
  TURN_DEGREES:   45,
  START_X_UNITS:  26,
  START_Y_UNITS:  -44,
  RAISED_X_UNITS: 30,
  RAISED_Y_UNITS: -50,
  STRUCK_X_UNITS: 18,
  STRUCK_Y_UNITS: -18,
} as const;

export const STRIKE_BODY = {
  WIND_UP_EYE_HEIGHT_UNITS: 5,
  STRUCK_EYE_HEIGHT_UNITS:  10,
  SQUASH_WIDTH_FACTOR:      0.96,
  SQUASH_HEIGHT_FACTOR:     1.03,
  STRUCK_GLOW_OPACITY:      0.6,
  /**
   * The eyes follow the Watcher on its flight and keep looking at it. The handoff gives the shift of 7 from 330; it starts when the hand
   * goes at 800, a builder decision, since with the square still struck at (18, -18) the right eye at 7 runs under it.
   */
  FOLLOW_EYE_LIFT_UNITS:    -3,
  FOLLOW_EYE_SHIFT_UNITS:   7,
} as const;

/** Five small sparks fly from the struck corner, fanned from up to forward and down; an angle of 0 is forward, negative is up. */
export const STRUCK_SMALL_SPARKS = {
  ORIGIN_X_UNITS:      20,
  ORIGIN_Y_UNITS:      -24,
  COUNT:               5,
  FIRST_ANGLE_DEGREES: -50,
  ANGLE_STEP_DEGREES:  20,
  TRAVEL_UNITS:        16,
} as const;

/**
 * The Watcher flies on a quadratic arc from the struck corner to its place, through a control point above both, so it rises past its
 * place and settles into it. It floats by `FLOAT_UNITS × sin(t / FLOAT_DIVISOR_MILLISECONDS)`, with `t` from its arrival so the float
 * starts where the flight ends.
 */
export const STRUCK_WATCHER = {
  START_X_UNITS:              20,
  START_Y_UNITS:              -24,
  ARC_CONTROL_X_UNITS:        24,
  ARC_CONTROL_Y_UNITS:        -50,
  PLACE_X_UNITS:              40,
  PLACE_Y_UNITS:              -40,
  FLOAT_UNITS:                2,
  FLOAT_DIVISOR_MILLISECONDS: 300,
} as const;
