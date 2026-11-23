/** The research gesture: four studies of equal length in turn; `sin(t / n)` names `n` as a divisor. */
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

/** The book of research, in the book's own coordinates before its turn and drop, in sprite units. */
export const BOOK_SHAPE = {
  COVER_POINTS: [
    { x: 27, y: -41 },
    { x: 39, y: -37.5 },
    { x: 51, y: -41 },
    { x: 51, y: -16.5 },
    { x: 39, y: -13 },
    { x: 27, y: -16.5 },
  ],
  BOOKMARK_POINTS: [
    { x: 37.5, y: -14.5 },
    { x: 40.5, y: -14.5 },
    { x: 40.5, y: -8 },
    { x: 39, y: -9.6 },
    { x: 37.5, y: -8 },
  ],
  PAGES_BELOW_PATH: 'M28.5 -17.3 Q33.5 -18.3 39 -14.3 Q44.5 -18.3 49.5 -17.3',
  LEFT_PAGE_PATH:   'M28.5 -41.5 Q33.5 -42.5 39 -38.5 L39 -15.5 Q33.5 -19.5 28.5 -18.5Z',
  RIGHT_PAGE_PATH:  'M49.5 -41.5 Q44.5 -42.5 39 -38.5 L39 -15.5 Q44.5 -19.5 49.5 -18.5Z',
  TEXT_PATH:        'M30.5 -37.5 L37 -35.5 M30.5 -33 L37 -31 M30.5 -28.5 L37 -26.5 M30.5 -24 L35 -22.6 '
    + 'M41 -35.5 L47.5 -37.5 M41 -31 L47.5 -33 M41 -26.5 L47.5 -28.5 M41 -22 L45.5 -23.4',
  SPINE_PATH:               'M39 -38.5 V-15.5',
  COVER_STROKE_UNITS:       1,
  PAGES_BELOW_STROKE_UNITS: 1.4,
  PAGE_STROKE_UNITS:        0.8,
  TEXT_STROKE_UNITS:        1,
  SPINE_STROKE_UNITS:       1,
  SPINE_X_UNITS:            39,
  SPINE_TOP_Y_UNITS:        -38.5,
  SPINE_BOTTOM_Y_UNITS:     -15.5,
  PAGE_WIDTH_UNITS:         10.5,
  PAGE_TOP_Y_UNITS:         -41.5,
  /** How far the top of a turning page rises when it stands upright. */
  PAGE_RISE_UNITS:          3,
  PAGE_HEIGHT_UNITS:        23,
  TILT_DEGREES:             20,
  TILT_CENTRE_X_UNITS:      39,
  TILT_CENTRE_Y_UNITS:      -27,
  DROP_UNITS:               13,
} as const;

/** The hologram of research, in sprite units, for Flint facing right. */
export const HOLOGRAM_SHAPE = {
  EMITTER_X_UNITS:             37,
  EMITTER_Y_UNITS:             -8,
  EMITTER_WIDTH_UNITS:         10,
  EMITTER_HEIGHT_UNITS:        2.4,
  EMITTER_CORNER_RADIUS_UNITS: 1,
  BEAMS_PATH:                  'M42 -8 L32 -22 M42 -8 L52 -22',
  BEAMS_STROKE_UNITS:          0.8,
  BEAMS_OPACITY:               0.6,
  PANEL_X_UNITS:               32,
  PANEL_Y_UNITS:               -48,
  PANEL_WIDTH_UNITS:           20,
  PANEL_HEIGHT_UNITS:          26,
  PANEL_CORNER_RADIUS_UNITS:   1,
  PANEL_FILL_OPACITY:          0.2,
  PANEL_STROKE_UNITS:          1,
  TEXT_PATH:                   'M35 -43 H47 M35 -38 H44 M35 -33 H48 M35 -28 H41',
  TEXT_STROKE_UNITS:           1.4,
  SCAN_LINE_X_UNITS:           32,
  SCAN_LINE_WIDTH_UNITS:       20,
  SCAN_LINE_HEIGHT_UNITS:      1.6,
  SCAN_LINE_TOP_Y_UNITS:       -47,
} as const;

/** The search bar of research, in sprite units, for Flint facing right. */
export const SEARCH_BAR_SHAPE = {
  X_UNITS:             26,
  Y_UNITS:             -47,
  WIDTH_UNITS:         28,
  HEIGHT_UNITS:        8,
  CORNER_RADIUS_UNITS: 4,
  STROKE_UNITS:        1,
  ICON_CENTRE_X_UNITS: 30.5,
  ICON_CENTRE_Y_UNITS: -43.3,
  ICON_RADIUS_UNITS:   1.7,
  ICON_HANDLE_PATH:    'M31.8 -42 L33 -40.8',
  QUERY_START_X_UNITS: 35.5,
  QUERY_Y_UNITS:       -43,
  FULL_QUERY_UNITS:    14,
  QUERY_STROKE_UNITS:  1.5,
} as const;
