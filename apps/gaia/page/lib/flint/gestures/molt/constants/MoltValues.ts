/**
 * Molt: a full context spills pages, Flint sheds a husk and comes out bright, in one
 * action; in sprite units, for Flint facing right, and milliseconds; `sin(t / n)` names `n` a divisor.
 */
export const MOLT = {
  DURATION_MILLISECONDS:     3000,
  STILL_MOMENT_MILLISECONDS: 1500,
} as const;

/** 0 to 900: the body strains, as a full context, and sweats. */
export const STRAIN = {
  ENDS_MILLISECONDS:    900,
  /** Width × (1 + WIDTH_FACTOR × sin(t / DIVISOR_MILLISECONDS)). */
  WIDTH_FACTOR:         0.05,
  DIVISOR_MILLISECONDS: 60,
  EYE_HEIGHT_UNITS:     5,
} as const;


/**
 * Page n leaves the top each `INTERVAL_MILLISECONDS` and flies `FLIGHT_MILLISECONDS`: x = side × (START_X + TRAVEL_X × p),
 * y = TOP_Y - RISE × p + FALL × p², turn side × TURN × p; its opacity is 1 until `FADE_FROM_PROGRESS`, then goes to 0. The side is +1, -1
 * in turn.
 */
export const SPILLED_PAGES = {
  COUNT:                 5,
  INTERVAL_MILLISECONDS: 150,
  FLIGHT_MILLISECONDS:   700,
  START_X_UNITS:         4,
  TRAVEL_X_UNITS:        14,
  TOP_Y_UNITS:           -50,
  RISE_UNITS:            16,
  FALL_UNITS:            34,
  TURN_DEGREES:          200,
  FADE_FROM_PROGRESS:    0.7,
  WIDTH_UNITS:           5,
  HEIGHT_UNITS:          6,
  STROKE_UNITS:          0.8,
} as const;

/** At 900 the husk is left where the body is, and the body shows the bright tint. */
export const SHED = {
  MILLISECONDS:                  900,
  BRIGHT_TINT_AMOUNT:            0.7,
  TINT_FADE_STARTS_MILLISECONDS: 1300,
  TINT_FADE_ENDS_MILLISECONDS:   2000,
  HOP_UNITS:                     10,
  HOP_ENDS_MILLISECONDS:         1400,
} as const;

/** The husk falls behind Flint from 900 to 2100: it moves to (END_X, END_Y), turns around the bottom tip to END_TURN and fades. */
export const HUSK = {
  FALL_ENDS_MILLISECONDS: 2100,
  END_X_UNITS:            -14,
  END_Y_UNITS:            8,
  END_TURN_DEGREES:       -25,
  OPACITY:                0.9,
  /** Its eyes are where the eyes were at the shed: the eye height of the strain, at the eye shift of rest. */
  EYE_HEIGHT_UNITS:       5,
  EYE_SHIFT_UNITS:        2,
} as const;

/** 1300 to 2000: the inner glow goes out, and the eyes open wide, then settle. */
export const RENEWAL = {
  STARTS_MILLISECONDS:       1300,
  ENDS_MILLISECONDS:         2000,
  GLOW_OPACITY:              0.5,
  WIDE_EYE_HEIGHT_UNITS:     10,
  SETTLED_EYE_HEIGHT_UNITS:  8,
  /** The wide eyes settle halfway through the renewal. */
  SETTLES_MILLISECONDS:      1650,
  GLINTS_START_MILLISECONDS: 1400,
  GLINTS_END_MILLISECONDS:   2200,
  HAPPY_EYES_MILLISECONDS:   1500,
} as const;
