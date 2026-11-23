/** Idle and movement; `sin(t / n)` names `n` as a divisor in milliseconds. */
export const HOVER = {
  HEIGHT_UNITS:               6,
  SWING_UNITS:                3,
  SWING_DIVISOR_MILLISECONDS: 400,
} as const;

export const BLINK = {
  INTERVAL_MILLISECONDS: 4000,
  CLOSED_MILLISECONDS:   120,
  CLOSED_HEIGHT_UNITS:   1,
} as const;

export const WALK = {
  SPEED_UNITS_PER_SECOND:      220,
  WOBBLE_FACTOR:               0.04,
  WOBBLE_DIVISOR_MILLISECONDS: 55,
} as const;

export const JUMP = {
  START_SPEED_UNITS_PER_SECOND:     520,
  GRAVITY_UNITS_PER_SECOND_SQUARED: 1400,
  AIR_WIDTH_FACTOR:                 0.94,
  AIR_HEIGHT_FACTOR:                1.07,
  AIR_EYE_HEIGHT_UNITS:             9,
  LANDING_WIDTH_FACTOR:             1.14,
  LANDING_HEIGHT_FACTOR:            0.82,
  LANDING_MILLISECONDS:             180,
} as const;

/** The spring of an emote mark's entrance: `2^(-10p) × sin((10p - 0.75) × 2.094) + 1`, with p from 0 to 1 over the duration. */
export const SPRING = {
  DURATION_MILLISECONDS: 200,
  DECAY_PER_PROGRESS:    10,
  PHASE_OFFSET:          0.75,
  ANGULAR_STEP_RADIANS:  2.094,
} as const;

/** A floor that moves towards a goal at the body rate (a rise, a lift that comes down); a builder decision. */
export const FLOOR_CHANGE = {
  /** The floor has come to its goal once it is this close. */
  ARRIVED_WITHIN_UNITS: 0.5,
} as const;
