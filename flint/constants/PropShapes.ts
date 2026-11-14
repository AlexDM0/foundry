/** The props of `01-character.md` and their fades of `02-animations.md`, in sprite units, for Flint facing right. */
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
  SLIDE_UNITS:         5,
} as const;

export const BOLT_SHAPE = {
  X_UNITS:      34,
  Y_UNITS:      -26,
  WIDTH_UNITS:  24,
  HEIGHT_UNITS: 4,
  SLIDE_UNITS:  8,
} as const;

/** The sheet, the ticket and a stacked page share this paper outline. */
export const PAPER_POINTS = '28,-46 48,-42 48,-10 28,-14';

export const SHEET_SHAPE = {
  STROKE_UNITS:                     1.2,
  LINE_COUNT:                       4,
  LINE_START_X_UNITS:               31,
  LINE_END_X_UNITS:                 45,
  FIRST_LINE_Y_UNITS:               -39,
  LINE_SPACING_UNITS:               7,
  LINE_DROP_UNITS:                  2.8,
  LINE_STROKE_UNITS:                1.5,
  SLIDE_UNITS:                      6,
  STACKED_PAGE_STROKE_UNITS:        1,
  STACKED_PAGE_TURN_CENTRE_X_UNITS: 38,
  STACKED_PAGE_TURN_CENTRE_Y_UNITS: -28,
} as const;

/** Page 1 lies nearest the sheet; the pile is loose, so each page has its own offset and turn. */
export const STACKED_PAGES = [
  { OFFSET_X_UNITS: 1.8, OFFSET_Y_UNITS: 0.6, TURN_DEGREES: 2.5 },
  { OFFSET_X_UNITS: 1.9, OFFSET_Y_UNITS: 2.6, TURN_DEGREES: -3 },
  { OFFSET_X_UNITS: 4.2, OFFSET_Y_UNITS: 2.4, TURN_DEGREES: 4 },
] as const;

export const LOOKING_GLASS_SHAPE = {
  LENS_RADIUS_UNITS:                5.5,
  LENS_OPACITY:                     0.7,
  RING_STROKE_UNITS:                1.6,
  HANDLE_STROKE_UNITS:              2.4,
  /** The hand holds the glass at this offset from the lens centre, exactly, on every frame. */
  GRIP_OFFSET_X_UNITS:              -8,
  GRIP_OFFSET_Y_UNITS:              8,
  /** The handle shows only while the hand that holds it is larger than this. */
  HANDLE_MINIMUM_HAND_RADIUS_UNITS: 2,
  RESTING_CENTRE_X_UNITS:           38,
  RESTING_CENTRE_Y_UNITS:           -30,
} as const;

export const MERGE_BLOCK_SHAPE = {
  X_UNITS:              28,
  WIDTH_UNITS:          12,
  HEIGHT_UNITS:         8,
  CORNER_RADIUS_UNITS:  1,
  TOP_BLOCK_Y_UNITS:    -42,
  BOTTOM_BLOCK_Y_UNITS: -18,
  MERGED_Y_UNITS:       -34,
  MERGED_HEIGHT_UNITS:  16,
  SPARK_SIDE_UNITS:     3,
  SPARK_COUNT:          4,
} as const;

export const TICKET_SHAPE = {
  STROKE_UNITS:        1.2,
  HEADER_POINTS:       '29,-44.8 47,-41.2 47,-37.6 29,-41.2',
  LINE_START_X_UNITS:  31,
  LINE_Y_UNITS:        [-34, -28, -22],
  FULL_LINE_UNITS:     12,
  LINE_STROKE_UNITS:   1.5,
  SEAL_SIDE_UNITS:     4,
  SEAL_CENTRE_X_UNITS: 43,
  SEAL_CENTRE_Y_UNITS: -15,
  SEAL_TURN_DEGREES:   45,
} as const;

/** Written lines on the ticket and the notepad go down this much for each unit of length, parallel to the paper's top edge. */
export const PAPER_SLOPE = 0.2;

export const BOOK_SHAPE = {
  COVER_POINTS:     '27,-41 39,-37.5 51,-41 51,-16.5 39,-13 27,-16.5',
  BOOKMARK_POINTS:  '37.5,-14.5 40.5,-14.5 40.5,-8 39,-9.6 37.5,-8',
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

export const NOTEPAD_SHAPE = {
  POINTS:               '30,-42 46,-38.8 46,-14.8 30,-18',
  STROKE_UNITS:         1.2,
  BINDING_PATH:         'M32.5 -40 L43.5 -37.8',
  BINDING_DASH_UNITS:   1,
  BINDING_GAP_UNITS:    2.2,
  BINDING_STROKE_UNITS: 1.6,
  LINE_START_X_UNITS:   33,
  LINE_Y_UNITS:         [-33, -28, -23],
  FULL_LINE_UNITS:      10,
  LINE_STROKE_UNITS:    1.5,
} as const;

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

/** A tick is drawn from its start point; it is never mirrored, so a facing-left pose mirrors it back about its own centre. */
export const TICK_SHAPE = {
  RELATIVE_PATH:       'l3 3 l6 -7',
  WIDTH_UNITS:         9,
  STROKE_UNITS:        2.4,
  SHEET_START_X_UNITS: 40,
  SHEET_START_Y_UNITS: -52,
  MERGE_START_X_UNITS: 45,
  MERGE_START_Y_UNITS: -27,
} as const;

export const CROSS_SHAPE = {
  PATH:         'M41 -56 l7 7 M48 -56 l-7 7',
  STROKE_UNITS: 2.2,
} as const;
