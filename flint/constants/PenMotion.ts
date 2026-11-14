/** The pen of `02-animations.md`, "Notes" and "Make a ticket": a triangle hand just right of the written line's end on the screen. */
export const PEN = {
  CORNER_COUNT:                3,
  RADIUS_UNITS:                5.5,
  /** Multiplied by the facing, so that the pen sits right of the line's end on the screen. */
  TURN_DEGREES:                -35,
  OFFSET_X_UNITS:              3,
  OFFSET_Y_UNITS:              5,
  WOBBLE_UNITS:                0.6,
  WOBBLE_DIVISOR_MILLISECONDS: 40,
} as const;

/** While Flint writes, it looks down at the line: the eye lift is (line y + offset) / divisor. */
export const WRITING_EYES = {
  HEIGHT_UNITS:      6,
  LIFT_OFFSET_UNITS: 28,
  LIFT_DIVISOR:      5,
} as const;
