/** The spark companion of `06-more-animations.md`: one spark for each running Watcher, behind Flint; `sin(t / n)` names `n` a divisor. */
export const WATCHER_SPARK = {
  MAXIMUM_COUNT:                4,
  /** Spark n is at (FIRST_X - ZIGZAG_X × (n mod 2), FIRST_Y + STEP_Y × n). */
  FIRST_X_UNITS:                -26,
  ZIGZAG_X_UNITS:               9,
  FIRST_Y_UNITS:                -44,
  STEP_Y_UNITS:                 11,
  BOB_UNITS:                    2,
  BOB_DIVISOR_MILLISECONDS:     500,
  /** Each spark bobs this far behind the one before it, in radians of the bob. */
  BOB_PHASE_PER_SPARK:          1.7,
  TURN_START_DEGREES:           45,
  TURN_DEGREES_PER_MILLISECOND: 0.03,
  PULSE_FACTOR:                 0.08,
  PULSE_DIVISOR_MILLISECONDS:   300,
} as const;
