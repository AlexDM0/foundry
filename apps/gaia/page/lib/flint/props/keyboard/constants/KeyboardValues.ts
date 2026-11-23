/** The keyboard, and its slide, in sprite units, for Flint facing right. */
export const KEYBOARD_SHAPE = {
  X_UNITS:             14,
  Y_UNITS:             -4,
  WIDTH_UNITS:         30,
  HEIGHT_UNITS:        4,
  CORNER_RADIUS_UNITS: 1,
  TURN_DEGREES:        -9,
  TURN_CENTRE_X_UNITS: 14,
  TURN_CENTRE_Y_UNITS: -2,
  STROKE_UNITS:        1.5,
  /** It slides this far up as it fades in. */
  SLIDE_UNITS:         5,
} as const;
