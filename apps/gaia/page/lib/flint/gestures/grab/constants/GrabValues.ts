/** Grab: two pentagons reach from the body centre to the target and close on it, or on nothing. */
export const GRAB_GESTURE_VALUES = {
  DURATION_MILLISECONDS:   900,
  CLOSE_MILLISECONDS:      250,
  NEAR_HAND_RADIUS_UNITS:  7,
  FAR_HAND_RADIUS_UNITS:   6.3,
  HAND_TURN_DEGREES:       0,
  REACH_UNITS:             44,
  CATCH_DISTANCE_UNITS:    58,
  /** Keeps the direction to a target on the body centre defined. */
  MINIMUM_DISTANCE_UNITS:  1,
  OPEN_SPREAD_UNITS:       9,
  CLOSED_SPREAD_UNITS:     4,
  SPREAD_DIRECTION_X:      0.7,
  SPREAD_DIRECTION_Y:      0.5,
  EYE_LIFT_DIVISOR_UNITS:  30,
  LOWEST_EYE_LIFT_UNITS:   -3,
  HIGHEST_EYE_LIFT_UNITS:  2,
  CAUGHT_EYE_HEIGHT_UNITS: 10,
  MISSED_EYE_HEIGHT_UNITS: 4,
} as const;
