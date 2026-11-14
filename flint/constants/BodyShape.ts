/** The body, eyes and glow of `01-character.md`, in sprite units; the origin is the bottom tip of the body, y points down. */
export const BODY_SHAPE = {
  PATH:                       'M0 -50 L20 -24 L0 0 L-20 -24Z',
  WIDTH_UNITS:                40,
  HEIGHT_UNITS:               50,
  CENTRE_Y_UNITS:             -24,
  GLOW_PATH:                  'M0 -38 L11 -24 L0 -11 L-11 -24Z',
  WORKING_LEAN_DEGREES:       5,
  /** The width factor of the sideways pose; the height does not change. */
  SIDEWAYS_WIDTH_FACTOR:      0.8,
  SIDEWAYS_EXTRA_SHIFT_UNITS: 2,
} as const;

export const EYE_SHAPE = {
  WIDTH_UNITS:             4,
  HEIGHT_UNITS:            8,
  TOP_Y_UNITS:             -28,
  LEFT_EYE_X_UNITS:        -7,
  RIGHT_EYE_X_UNITS:       3,
  SHIFT_AT_REST_UNITS:     2,
  SHIFT_AT_WORK_UNITS:     6,
  GLARE_SLANT_DEGREES:     20,
  HAPPY_EYES_PATH:         'M-6 -22 q2.5 -6 5 0 M4 -22 q2.5 -6 5 0',
  HAPPY_EYES_STROKE_UNITS: 2.5,
} as const;

/** The dashed outline of `06-more-animations.md`, "New channels of the pose", that the body shows while its fill fades. */
export const BODY_OUTLINE = {
  STROKE_UNITS: 1.5,
  DASH_UNITS:   3,
  GAP_UNITS:    2,
} as const;
