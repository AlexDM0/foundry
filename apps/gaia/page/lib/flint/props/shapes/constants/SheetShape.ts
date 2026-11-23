/**
 * The floating sheet of Review, which Bug jar and Waiver share: its printed lines, stacked pages and verdicts, in
 * sprite units, for Flint facing right.
 */
export const SHEET_SHAPE = {
  LINE_COUNT:                       4,
  LINE_START_X_UNITS:               31,
  LINE_END_X_UNITS:                 45,
  FIRST_LINE_Y_UNITS:               -39,
  LINE_SPACING_UNITS:               7,
  LINE_DROP_UNITS:                  2.8,
  LINE_STROKE_UNITS:                1.5,
  /** It slides this far in from the side away from Flint as it fades in. */
  SLIDE_UNITS:                      6,
  STACKED_PAGE_STROKE_UNITS:        1,
  STACKED_PAGE_TURN_CENTRE_X_UNITS: 38,
  STACKED_PAGE_TURN_CENTRE_Y_UNITS: -28,
  TICK_START_X_UNITS:               40,
  TICK_START_Y_UNITS:               -52,
  CROSS_START_X_UNITS:              41,
  CROSS_START_Y_UNITS:              -56,
} as const;

/** Page 1 lies nearest the sheet; the pile is loose, so each page has its own offset and turn. */
export const STACKED_PAGES = [
  { OFFSET_X_UNITS: 1.8, OFFSET_Y_UNITS: 0.6, TURN_DEGREES: 2.5 },
  { OFFSET_X_UNITS: 1.9, OFFSET_Y_UNITS: 2.6, TURN_DEGREES: -3 },
  { OFFSET_X_UNITS: 4.2, OFFSET_Y_UNITS: 2.4, TURN_DEGREES: 4 },
] as const;
