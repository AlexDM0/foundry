/** Fasten of `02-animations.md`: one hexagon at the bolt waits for a share of each cycle, turns, then waits again. */
export const FASTEN_GESTURE_VALUES = {
  HAND_RADIUS_UNITS:      8,
  HAND_CENTRE_X_UNITS:    31,
  HAND_CENTRE_Y_UNITS:    -24,
  CYCLE_MILLISECONDS:     1200,
  WAIT_FRACTION:          0.15,
  TURN_FRACTION:          0.45,
  TURN_PER_CYCLE_DEGREES: 60,
  EYE_HEIGHT_UNITS:       5,
} as const;
