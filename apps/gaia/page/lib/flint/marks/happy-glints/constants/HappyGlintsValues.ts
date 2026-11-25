/** Where the Happy emote and the baton pass hold the glints: below the shared anchor, so a happy hop keeps them inside a strip slot. */
export const LOWERED_HAPPY_GLINTS_ANCHOR_Y_UNITS = -45;

/** The happy glints, at the shared anchor of "!" and "?". */
export const HAPPY_GLINTS_SHAPE = {
  LARGE_X_UNITS:    -5,
  LARGE_Y_UNITS:    -1,
  LARGE_SIDE_UNITS: 4.5,
  SMALL_X_UNITS:    2,
  SMALL_Y_UNITS:    -5,
  SMALL_SIDE_UNITS: 3,
  TURN_DEGREES:     45,
} as const;
