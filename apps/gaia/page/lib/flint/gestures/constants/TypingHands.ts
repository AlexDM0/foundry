/**
 * The two squares that type on the keyboard, which every gesture that types shares: each hand's key, and the
 * tap of normal typing. A tap is negative, up from the key: `-depth × (TAP_MIDDLE ± TAP_MIDDLE × sin(t / divisor))`, the far hand opposite.
 */
export const TYPING_HANDS = {
  NEAR_HAND_RADIUS_UNITS:   6.4,
  NEAR_HAND_CENTRE_X_UNITS: 22,
  NEAR_HAND_CENTRE_Y_UNITS: -10,
  FAR_HAND_RADIUS_UNITS:    5.8,
  FAR_HAND_CENTRE_X_UNITS:  30,
  FAR_HAND_CENTRE_Y_UNITS:  -13,
  HAND_TURN_DEGREES:        45,
  TAP_MIDDLE:               0.5,
} as const;

export const NORMAL_TYPING = {
  TAP_DEPTH_UNITS:          4,
  TAP_DIVISOR_MILLISECONDS: 64,
  EYE_LIFT_UNITS:           2,
} as const;
