/** Wave: one pentagon rocks with `rock = sin(t / ROCK_DIVISOR_MILLISECONDS)` while the "Hi!" mark shows. */
export const WAVE_GESTURE_VALUES = {
  DURATION_MILLISECONDS:     2200,
  HAND_RADIUS_UNITS:         7,
  HAND_CENTRE_X_UNITS:       27,
  HAND_CENTRE_Y_UNITS:       -41,
  ROCK_DIVISOR_MILLISECONDS: 100,
  ROCK_SWING_UNITS:          3,
  ROCK_TURN_DEGREES:         22,
  EYE_HEIGHT_UNITS:          9,
  /** In the sideways pose of a peek, the hand is this far ahead of the body centre on the screen. */
  PEEK_HAND_DISTANCE_UNITS:  21,
} as const;
