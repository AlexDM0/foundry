/** The merge gesture of `02-animations.md`, "Merge": one cycle of pressing two blocks into one, in milliseconds. */
export const MERGE_TIMELINE = {
  CYCLE_MILLISECONDS:        2600,
  FADE_IN_MILLISECONDS:      300,
  PRESS_STARTS_MILLISECONDS: 350,
  SNAP_MILLISECONDS:         900,
  SQUASH_ENDS_MILLISECONDS:  1100,
  SPARKS_MILLISECONDS:       450,
  LEAVES_MILLISECONDS:       1900,
  /** Reduced motion holds the merged block with its tick and the happy eyes. */
  STILL_MOMENT_MILLISECONDS: 1500,
} as const;

export const MERGE_PRESS = {
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

export const MERGE_SPARKS = {
  CENTRE_Y_UNITS: -26,
  START_X_UNITS:  7,
  TRAVEL_X_UNITS: 14,
  START_Y_UNITS:  2,
  TRAVEL_Y_UNITS: 12,
  TURN_DEGREES:   180,
  /** The (wx, wy) way of each spark. */
  WAYS:           [
    { X: -1, Y: -0.5 },
    { X: 1, Y: -0.5 },
    { X: -1, Y: 0.6 },
    { X: 1, Y: 0.6 },
  ],
} as const;
