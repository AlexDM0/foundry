/** Ribbon of `06-more-animations.md`: one loop in which three tickets of one epic are bundled with a ribbon; in milliseconds. */
export const RIBBON_TIMELINE = {
  CYCLE_MILLISECONDS:        4000,
  FADE_IN_MILLISECONDS:      300,
  PUSH_STARTS_MILLISECONDS:  300,
  PUSH_ENDS_MILLISECONDS:    900,
  WRAP_ENDS_MILLISECONDS:    1700,
  BOW_ENDS_MILLISECONDS:     2000,
  LEAVES_MILLISECONDS:       2800,
  LEAVE_ENDS_MILLISECONDS:   3400,
  /** Reduced motion holds the tied bundle with its bow and the happy eyes. */
  STILL_MOMENT_MILLISECONDS: 2300,
} as const;

/** Three mini sheets around one middle height: apart at the start, pushed together into a fan. */
export const RIBBON_SHEETS = {
  CENTRE_Y_UNITS:         -30,
  APART_X_UNITS:          [30, 38, 46],
  APART_TURNS_DEGREES:    [-14, 0, 14],
  TOGETHER_X_UNITS:       [34, 38, 42],
  TOGETHER_TURNS_DEGREES: [-8, 0, 8],
  LEAVE_X_UNITS:          14,
  LEAVE_Y_UNITS:          -6,
} as const;

/** The ribbon grows from its left end to its full width; the bow is two triangles and a knot, all in the ribbon colour. */
export const RIBBON_BAND = {
  X_UNITS:                  28,
  Y_UNITS:                  -32,
  WIDTH_UNITS:              20,
  HEIGHT_UNITS:             3.5,
  BOW_CENTRE_X_UNITS:       38,
  BOW_CENTRE_Y_UNITS:       -30.5,
  BOW_WING_LENGTH_UNITS:    6,
  BOW_WING_HALF_SPAN_UNITS: 4,
  BOW_KNOT_SIDE_UNITS:      3,
} as const;

/** Two pentagons push from the outer sides; then one hexagon goes once around the bundle on an ellipse, starting at the near side. */
export const RIBBON_HANDS = {
  PUSH_CORNER_COUNT:           5,
  NEAR_PUSH_X_UNITS:           50,
  NEAR_PUSH_RADIUS_UNITS:      6,
  FAR_PUSH_X_UNITS:            26,
  FAR_PUSH_RADIUS_UNITS:       5.4,
  WRAP_CORNER_COUNT:           6,
  WRAP_RADIUS_UNITS:           5.5,
  /** On the side of the ellipse by the body the hexagon shrinks to this, so it never touches the body's side corner, a builder decision. */
  WRAP_BODY_SIDE_RADIUS_UNITS: 4.5,
  ELLIPSE_CENTRE_X_UNITS:      38,
  ELLIPSE_CENTRE_Y_UNITS:      -30,
  ELLIPSE_RADIUS_X_UNITS:      13,
  ELLIPSE_RADIUS_Y_UNITS:      9,
} as const;

/** While Flint bundles, the eyes of writing: the nearest of an existing animation. */
export const RIBBON_EYES = { HEIGHT_UNITS: 6 } as const;
