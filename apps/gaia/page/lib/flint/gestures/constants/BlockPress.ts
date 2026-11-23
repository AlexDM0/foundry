/** The press of two blocks into one: two hexagons press the blocks together and let go at the snap. */
export const BLOCK_PRESS = {
  CENTRE_X_UNITS:              34,
  TRAVEL_UNITS:                8,
  NEAR_HAND_RADIUS_UNITS:      6,
  FAR_HAND_RADIUS_UNITS:       5.5,
  HAND_CORNER_COUNT:           6,
  NEAR_HAND_ABOVE_BLOCK_UNITS: 7,
  FAR_HAND_BELOW_BLOCK_UNITS:  15,
  /** After the snap, each hand moves this far away from the block. */
  RELEASE_UNITS:               3,
  /** The eyes widen while `press` goes from this value to 1. */
  EYES_WIDEN_FROM_PRESS:       0.5,
  EYE_HEIGHT_UNITS:            6,
  EYE_WIDENING_UNITS:          4,
  EYE_LIFT_UNITS:              -1,
  SNAP_WIDTH_FACTOR:           1.04,
  SNAP_HEIGHT_FACTOR:          0.95,
  MERGED_LEAVE_X_UNITS:        12,
  MERGED_LEAVE_Y_UNITS:        5,
} as const;
