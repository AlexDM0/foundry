/** The hand of Point in `02-animations.md`, which Playbook shares: one triangle that points forward and swings by `SWING_UNITS × sin(t / divisor)`. */
export const POINTING_HAND = {
  RADIUS_UNITS:               7,
  CENTRE_X_UNITS:             29,
  CENTRE_Y_UNITS:             -25,
  SWING_UNITS:                4,
  SWING_DIVISOR_MILLISECONDS: 220,
  TURN_DEGREES:               90,
} as const;
