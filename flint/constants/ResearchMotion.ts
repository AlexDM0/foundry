/** The research gesture of `02-animations.md`, "Research": four studies of equal length in turn; `sin(t / n)` names `n` as a divisor. */
export const RESEARCH = {
  STUDY_MILLISECONDS:        2600,
  /** Reduced motion holds the book study before its page turns. */
  STILL_MOMENT_MILLISECONDS: 780,
} as const;

export const BOOK_STUDY = {
  HAND_CORNER_COUNT:          5,
  HAND_RADIUS_UNITS:          5,
  /** The hand rests at book point (spine x + this × facing, `HAND_REST_Y_UNITS`). */
  HAND_REST_FROM_SPINE_UNITS: 12,
  HAND_REST_Y_UNITS:          -17,
  /** While the page turns, the hand holds its outer edge this far below the edge's top. */
  HAND_BELOW_PAGE_TOP_UNITS:  13,
  PAGE_TURN_STARTS_PART:      0.45,
  PAGE_TURN_ENDS_PART:        0.65,
  EYE_HEIGHT_UNITS:           6,
  EYE_LIFT_UNITS:             2.5,
  EYE_SHIFT_UNITS:            6,
  EYE_SHIFT_SWING_UNITS:      1.5,
  /** The eye shift swings this many half turns over one study. */
  EYE_SHIFT_HALF_TURNS:       4,
} as const;

export const NOTES_STUDY = { LINE_MILLISECONDS: 700, } as const;

/** The search study types as normal typing does, with its own beat. */
export const SEARCH_STUDY = {
  HAND_CORNER_COUNT:        4,
  HAND_TURN_DEGREES:        45,
  NEAR_HAND_X_UNITS:        22,
  NEAR_HAND_Y_UNITS:        -10,
  NEAR_HAND_RADIUS_UNITS:   6.4,
  FAR_HAND_X_UNITS:         30,
  FAR_HAND_Y_UNITS:         -13,
  FAR_HAND_RADIUS_UNITS:    5.8,
  TAP_UNITS:                4,
  TAP_DIVISOR_MILLISECONDS: 40,
  /** The query grows in this many steps, one each tenth of the study. */
  QUERY_STEP_COUNT:         8,
  QUERY_STEPS_PER_STUDY:    10,
  EYE_HEIGHT_UNITS:         6,
  EYE_LIFT_UNITS:           -3,
} as const;

export const HOLOGRAM_STUDY = {
  SCAN_MILLISECONDS:            1200,
  SCAN_TRAVEL_UNITS:            24,
  FLICKER_BASE:                 0.85,
  FLICKER_SWING:                0.15,
  FLICKER_DIVISOR_MILLISECONDS: 60,
  EYE_HEIGHT_UNITS:             4.5,
  EYE_LIFT_START_UNITS:         -4,
  EYE_LIFT_TRAVEL_UNITS:        3,
  EYE_SHIFT_UNITS:              5,
  EYE_SHIFT_SWING_UNITS:        2,
  EYE_SHIFT_HALF_TURNS:         6,
} as const;
