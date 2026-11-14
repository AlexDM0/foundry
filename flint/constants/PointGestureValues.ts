/** Point of `02-animations.md`: one triangle that points forward and swings by `HAND_SWING_UNITS × sin(t / divisor)`. */
export const POINT_GESTURE_VALUES = {
  HAND_RADIUS_UNITS:               7,
  HAND_CENTRE_X_UNITS:             29,
  HAND_CENTRE_Y_UNITS:             -25,
  HAND_SWING_UNITS:                4,
  HAND_SWING_DIVISOR_MILLISECONDS: 220,
  HAND_TURN_DEGREES:               90,
} as const;
