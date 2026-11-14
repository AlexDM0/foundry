/** Gate run of `06-more-animations.md`: four lamps on a rail run one after the other and pass; sprite units, for Flint facing right. */
export const GATE_RUN_TIMELINE = {
  CYCLE_MILLISECONDS:           4200,
  FADE_IN_MILLISECONDS:         300,
  /** Lamp n runs from `FIRST_LAMP_RUNS + LAMP_STEP × n` for one step, then it is passed. */
  FIRST_LAMP_RUNS_MILLISECONDS: 300,
  LAMP_STEP_MILLISECONDS:       650,
  ALL_PASSED_MILLISECONDS:      2900,
  FADES_OUT_MILLISECONDS:       3700,
  /** Reduced motion holds the passed lamps, the tick and the happy eyes. */
  STILL_MOMENT_MILLISECONDS:    3200,
} as const;

/** The eyes follow the lamp that runs: the eye shift is `FIRST_LAMP_EYE_SHIFT + n`. */
export const GATE_RUN_POSE = {
  FIRST_LAMP_EYE_SHIFT_UNITS: 4,
  EYE_HEIGHT_UNITS:           6,
} as const;

export const GATE_RAIL_SHAPE = {
  X_UNITS:             26,
  Y_UNITS:             -30,
  WIDTH_UNITS:         28,
  HEIGHT_UNITS:        8,
  CORNER_RADIUS_UNITS: 4,
  LAMP_X_UNITS:        [31, 37, 43, 49],
  LAMP_Y_UNITS:        -26,
  TICK_START_X_UNITS:  36,
  TICK_START_Y_UNITS:  -44,
} as const;
