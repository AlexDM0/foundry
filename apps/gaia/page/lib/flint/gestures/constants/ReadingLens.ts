/**
 * Review, which Bug jar shares: the lens moves along the line Flint reads, `across` from 0 to 1 on the screen, below
 * the line of `flint/props/shapes/constants/SheetShape.ts`; the eyes go down the lines and along them with it.
 */
export const READING_LENS = {
  START_X_UNITS:             31,
  TRAVEL_UNITS:              13,
  BELOW_LINE_UNITS:          1,
  EYE_LIFT_FIRST_LINE_UNITS: -2,
  EYE_LIFT_PER_LINE_UNITS:   1.4,
  EYE_SHIFT_START_UNITS:     5,
  EYE_SHIFT_TRAVEL_UNITS:    2,
} as const;
