/**
 * The emote marks of `01-character.md`. A mark sits at its anchor, relative to the bottom tip of the body; the anchor's x follows the
 * facing, the mark itself never mirrors.
 */
export const ANGER_VEIN_SHAPE = {
  PATH:           'M-6.5 -2 Q-2 -2 -2 -6.5 M6.5 -2 Q2 -2 2 -6.5 M-6.5 2 Q-2 2 -2 6.5 M6.5 2 Q2 2 2 6.5',
  STROKE_UNITS:   1.9,
  ANCHOR_X_UNITS: 18,
  ANCHOR_Y_UNITS: -52,
  SCALE:          1.05,
} as const;

export const SWEAT_DROP_SHAPE = {
  PATH:                   'M0 -8 q7 10 0 14 q-7 -4 0 -14Z',
  HIGHLIGHT_X_UNITS:      -2.6,
  HIGHLIGHT_Y_UNITS:      0,
  HIGHLIGHT_WIDTH_UNITS:  1.6,
  HIGHLIGHT_HEIGHT_UNITS: 3,
  ANCHOR_X_UNITS:         13,
  ANCHOR_Y_UNITS:         -48,
  SCALE:                  1.45,
} as const;

/** "!", "?" and "Hi!" share their type; the thinking dots, the lightbulb and the glints share the anchor of "!" and "?". */
export const MARK_TEXT_SHAPE = {
  FONT_FAMILY:            'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  FONT_WEIGHT:            700,
  BASELINE_Y_UNITS:       5,
  EXCLAMATION_TEXT:       '!',
  QUESTION_TEXT:          '?',
  GREETING_TEXT:          'Hi!',
  EXCLAMATION_SIZE_UNITS: 14,
  QUESTION_SIZE_UNITS:    14,
  GREETING_SIZE_UNITS:    12,
} as const;

export const SHARED_MARK_ANCHOR = {
  ANCHOR_X_UNITS: 20,
  ANCHOR_Y_UNITS: -54,
  SCALE:          1.5,
} as const;

export const GREETING_ANCHOR = {
  ANCHOR_X_UNITS: 38,
  ANCHOR_Y_UNITS: -58,
  SCALE:          1.5,
} as const;

export const THINKING_DOTS_SHAPE = {
  SIDE_UNITS: 3,
  X_UNITS:    [-7, -1.5, 4],
  Y_UNITS:    -1.5,
} as const;

export const HAPPY_GLINTS_SHAPE = {
  LARGE_X_UNITS:    -5,
  LARGE_Y_UNITS:    -1,
  LARGE_SIDE_UNITS: 4.5,
  SMALL_X_UNITS:    2,
  SMALL_Y_UNITS:    -5,
  SMALL_SIDE_UNITS: 3,
  TURN_DEGREES:     45,
} as const;

export const SWEAT_BEADS_SHAPE = {
  PATH:           'M0 -3 q2.6 3.8 0 5.2 q-2.6 -1.4 0 -5.2Z',
  COUNT:          3,
  ANCHOR_X_UNITS: 0,
  ANCHOR_Y_UNITS: -48,
  SCALE:          1.5,
} as const;

export const LIGHTBULB_SHAPE = {
  GLASS_PATH:                  'M0 -8 A6 6 0 0 1 3.6 2.8 L3.2 4.5 H-3.2 L-3.6 2.8 A6 6 0 0 1 0 -8Z',
  GLASS_STROKE_UNITS:          0.45,
  GLASS_MIDDLE_STOP:           0.55,
  RAYS_PATH:                   'M0 -10 V-12 M-7.3 -6.8 L-8.8 -8.3 M7.3 -6.8 L8.8 -8.3 M-9.2 -1.5 H-11.2 M9.2 -1.5 H11.2',
  RAYS_STROKE_UNITS:           0.8,
  FITTING_SHINE_STOP:          0.35,
  FITTING_MIDDLE_STOP:         0.6,
  FIRST_BAND_X_UNITS:          -3,
  FIRST_BAND_Y_UNITS:          4.6,
  FIRST_BAND_WIDTH_UNITS:      6,
  FIRST_BAND_HEIGHT_UNITS:     1.6,
  SECOND_BAND_X_UNITS:         -2.6,
  SECOND_BAND_Y_UNITS:         6.5,
  SECOND_BAND_WIDTH_UNITS:     5.2,
  SECOND_BAND_HEIGHT_UNITS:    1.4,
  BAND_CORNER_RADIUS_UNITS:    0.6,
  CONTACT_X_UNITS:             -1.6,
  CONTACT_Y_UNITS:             8.2,
  CONTACT_WIDTH_UNITS:         3.2,
  CONTACT_HEIGHT_UNITS:        1,
  CONTACT_CORNER_RADIUS_UNITS: 0.5,
} as const;

/** The embers of sleep: squares behind Flint that never mirror; each entry is one ember, in rising order. */
export const EMBER_SHAPES = [
  { SIDE_UNITS: 5, COLOUR: 'body' },
  { SIDE_UNITS: 4, COLOUR: 'emberLight' },
  { SIDE_UNITS: 3.5, COLOUR: 'emberDark' },
  { SIDE_UNITS: 6, COLOUR: 'body' },
] as const;
