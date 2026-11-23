/** Regrouping: Flint counts its Watchers, sweeps away the dead one and is happy; in sprite units, facing right. */
export const REGROUP_TIMELINE = {
  CYCLE_MILLISECONDS:           4600,
  FADE_IN_MILLISECONDS:         400,
  POINTING_STARTS_MILLISECONDS: 400,
  POINTING_MILLISECONDS:        700,
  SWEEP_STARTS_MILLISECONDS:    3200,
  SWEEP_ENDS_MILLISECONDS:      3900,
  FADE_OUT_STARTS_MILLISECONDS: 4300,
  /** A spark that Flint points at changes over the spring of a mark's entrance. */
  CHANGE_MILLISECONDS:          200,
  STILL_MOMENT_MILLISECONDS:    2400,
} as const;

/**
 * The four sparks, by their centres; spark 2 is the dead one. Each starts dim, as the dark ember colour at low opacity. The hand points at
 * each from the body centre (0, -24), as the design says, but at spark 1 from straight below it: a builder decision, since the line from
 * the body centre to spark 1 passes over spark 0, and the hand on it would cover spark 0.
 */
export const REGROUP_SPARKS = {
  PLACES: [
    {
      X_UNITS: 28, Y_UNITS: -46, POINTED_FROM_X_UNITS: 0, POINTED_FROM_Y_UNITS: -24,
    },
    {
      X_UNITS: 38, Y_UNITS: -50, POINTED_FROM_X_UNITS: 38, POINTED_FROM_Y_UNITS: -24,
    },
    {
      X_UNITS: 48, Y_UNITS: -44, POINTED_FROM_X_UNITS: 0, POINTED_FROM_Y_UNITS: -24,
    },
    {
      X_UNITS: 50, Y_UNITS: -32, POINTED_FROM_X_UNITS: 0, POINTED_FROM_Y_UNITS: -24,
    },
  ],
  DEAD_INDEX:               2,
  DIM_OPACITY:              0.35,
  DEAD_OPACITY:             0.15,
  DEAD_FALL_UNITS:          14,
  /** The live sparks bob by `BOB_UNITS × sin(t / BOB_DIVISOR_MILLISECONDS + n)` once the dead one is gone. */
  BOB_UNITS:                2,
  BOB_DIVISOR_MILLISECONDS: 300,
} as const;

/**
 * The pointing triangle stands this far from its spark on the line from the spark's pointed-from place, its first corner along that line; a
 * corner points up at a turn of 0, a quarter turn before the line's own angle. The sweeping square stands on its side, as a typing square
 * does.
 */
export const REGROUP_HANDS = {
  POINTING_CORNER_COUNT:     3,
  POINTING_RADIUS_UNITS:     6,
  DISTANCE_FROM_SPARK_UNITS: 9,
  CORNER_UP_TURN_DEGREES:    90,
  SWEEPING_CORNER_COUNT:     4,
  SWEEPING_RADIUS_UNITS:     6,
  SWEEPING_TURN_DEGREES:     45,
  SWEEP_START_X_UNITS:       44,
  SWEEP_START_Y_UNITS:       -48,
  SWEEP_END_X_UNITS:         54,
  SWEEP_END_Y_UNITS:         -38,
} as const;

/** The eyes look at the spark: the lift is `(spark y - LIFT_CENTRE_Y_UNITS) / LIFT_DIVISOR_UNITS`, held between its bounds. */
export const REGROUP_EYES = {
  SHIFT_UNITS:         6,
  LIFT_DIVISOR_UNITS:  8,
  LOWEST_LIFT_UNITS:   -3,
  HIGHEST_LIFT_UNITS:  2,
  DEAD_HEIGHT_UNITS:   5,
  /** The body centre the lift is measured from. */
  LIFT_CENTRE_Y_UNITS: -24,
} as const;
