/** The glints' own anchor, beside the top of the body and lower than the shared one, so a happy hop keeps them below Flint's top hover. */
export const HAPPY_GLINTS_ANCHOR = {
  ANCHOR_X_UNITS: 20,
  ANCHOR_Y_UNITS: -45,
  SCALE:          1.5,
} as const;

/** The happy glints, around their anchor. */
export const HAPPY_GLINTS_SHAPE = {
  LARGE_X_UNITS:    -5,
  LARGE_Y_UNITS:    -1,
  LARGE_SIDE_UNITS: 4.5,
  SMALL_X_UNITS:    2,
  SMALL_Y_UNITS:    -5,
  SMALL_SIDE_UNITS: 3,
  TURN_DEGREES:     45,
} as const;
