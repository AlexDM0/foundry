/** The hands: regular polygons that grow from the body and shrink away before they change shape. */
export const HAND_SHAPE = {
  EMERGE_X_UNITS:              10,
  EMERGE_Y_UNITS:              -22,
  /** At or below this radius a hand counts as gone: it may take a new shape, and it starts again from the body. */
  VANISHED_RADIUS_UNITS:       0.6,
  DRAWN_MINIMUM_RADIUS_UNITS:  0.4,
  /** The first corner points up at a turn of 0. */
  FIRST_CORNER_OFFSET_DEGREES: -90,
  POINTING_CORNER_COUNT:       3,
  TYPING_CORNER_COUNT:         4,
  GRABBING_CORNER_COUNT:       5,
  FASTENING_CORNER_COUNT:      6,
} as const;

export const ANGLE = {
  FULL_TURN_DEGREES: 360,
  HALF_TURN_DEGREES: 180,
} as const;
