/** Needs an answer of `06-more-animations.md`: Flint holds up a card with "?", and in its second variant knocks; sprite units, facing right. */
export const ASK_TIMELINE = {
  /** Each period Flint looks at the card, in its last moment. */
  LOOK_PERIOD_MILLISECONDS:        3000,
  LOOK_MILLISECONDS:               400,
  KNOCK_CYCLE_MILLISECONDS:        1600,
  KNOCK_STARTS_MILLISECONDS:       [200, 420],
  KNOCK_MILLISECONDS:              90,
  KNOCK_ARCS_FADE_MILLISECONDS:    200,
  ASK_STILL_MOMENT_MILLISECONDS:   0,
  /** The middle of the first knock: the knuckle at its largest and the arcs shown. */
  KNOCK_STILL_MOMENT_MILLISECONDS: 245,
} as const;

/** The card and its hand move up and down by `BOB_UNITS × sin(t / BOB_DIVISOR)`; the card turns by `TURN × sin(t / TURN_DIVISOR)` around the hand. */
export const ASK_POSE = {
  LEAN_DEGREES:              3,
  EYE_HEIGHT_UNITS:          8,
  EYE_SHIFT_UNITS:           3,
  LOOK_EYE_SHIFT_UNITS:      6,
  HAND_RADIUS_UNITS:         6,
  BOB_UNITS:                 1.5,
  BOB_DIVISOR_MILLISECONDS:  300,
  TURN_DEGREES:              4,
  TURN_DIVISOR_MILLISECONDS: 600,
} as const;

/** Flint faces the user; the far hand holds the smaller card, and the near hand is a square knuckle that knocks. */
export const ASK_KNOCK_POSE = {
  LEAN_DEGREES:           0,
  EYE_SHIFT_UNITS:        0,
  EYE_HEIGHT_UNITS:       9,
  CARD_SCALE:             0.85,
  CARD_DROP_UNITS:        6,
  /** The pentagon of Ask at the scale of the card, so the far hand is a little smaller than the knuckle. */
  FAR_HAND_RADIUS_UNITS:  5.1,
  KNUCKLE_CENTRE_X_UNITS: 26,
  KNUCKLE_CENTRE_Y_UNITS: -38,
  KNUCKLE_RADIUS_UNITS:   5.5,
  KNOCK_RADIUS_UNITS:     7.5,
  KNUCKLE_TURN_DEGREES:   0,
  KNOCK_LIFT_UNITS:       1,
} as const;

/** The card, with "?" in the hand colour centred on the glyph centre; the hand holds it just below its bottom left corner. */
export const ASK_CARD_SHAPE = {
  X_UNITS:                           30,
  Y_UNITS:                           -44,
  WIDTH_UNITS:                       16,
  HEIGHT_UNITS:                      20,
  CORNER_RADIUS_UNITS:               1.5,
  STROKE_UNITS:                      1.2,
  CENTRE_X_UNITS:                    38,
  CENTRE_Y_UNITS:                    -34,
  GLYPH_SIZE_UNITS:                  12,
  /** The baseline sits this far below the glyph's centre, as the marks of `01-character.md` set it for their size. */
  GLYPH_BASELINE_BELOW_CENTRE_UNITS: 4.3,
  HOLD_BELOW_CORNER_UNITS:           2,
} as const;

/** Two short arcs above the knuckle; an angle of 0 is forward, negative is up. */
export const KNOCK_ARCS_SHAPE = {
  RADIUS_UNITS: 9.5,
  STROKE_UNITS: 1,
  ARCS_DEGREES: [
    { FROM: -150, TO: -115 },
    { FROM: -65, TO: -30 },
  ],
} as const;
