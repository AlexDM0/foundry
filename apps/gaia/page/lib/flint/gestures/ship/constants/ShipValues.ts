/**
 * Ship: a delivered ticket. Two pentagons lift a landed block onto a shelf, a tick shows, and Flint salutes. In
 * milliseconds from the start of the action, and in sprite units for Flint facing right.
 */
export const SHIP_TIMELINE = {
  DURATION_MILLISECONDS:        2400,
  FADE_IN_MILLISECONDS:         300,
  LIFT_STARTS_MILLISECONDS:     300,
  LANDED_MILLISECONDS:          900,
  SQUASH_MILLISECONDS:          150,
  SHELF_DROP_MILLISECONDS:      100,
  TICK_SHOWS_MILLISECONDS:      1000,
  SALUTE_STARTS_MILLISECONDS:   1200,
  HAPPY_EYES_FROM_MILLISECONDS: 1700,
  /** The salute ends, the hand goes away and the props fade out until the action ends. */
  LEAVES_MILLISECONDS:          2000,
  /** Reduced motion holds the salute beside the shelved block and its tick. */
  STILL_MOMENT_MILLISECONDS:    1500,
} as const;

export const SHIP_SHAPE = {
  SHELF_START_X_UNITS:  28,
  SHELF_END_X_UNITS:    56,
  SHELF_Y_UNITS:        -30,
  SHELF_STROKE_UNITS:   1.6,
  SHELF_DROP_UNITS:     1,
  /** The top left corner of the block before the lift, and on the shelf. */
  START_X_UNITS:        28,
  START_Y_UNITS:        -20,
  SHELVED_X_UNITS:      36,
  SHELVED_Y_UNITS:      -38,
  /** On landing the block is this share of its height, on the shelf. */
  SQUASH_HEIGHT_FACTOR: 0.85,
  TICK_START_X_UNITS:   40,
  TICK_START_Y_UNITS:   -50,
} as const;

/** The two pentagons hold the block at its lower corners: each at this offset from the block's top left corner. */
export const SHIP_HANDS = {
  NEAR_RADIUS_UNITS:   6,
  FAR_RADIUS_UNITS:    5.4,
  NEAR_OFFSET_X_UNITS: 14,
  FAR_OFFSET_X_UNITS:  0,
  OFFSET_Y_UNITS:      8,
  SALUTE_RADIUS_UNITS: 6,
  SALUTE_TURN_DEGREES: 20,
  SALUTE_X_UNITS:      16,
  SALUTE_Y_UNITS:      -40,
} as const;

/** While the block rises the eyes follow it with the lift of Regrouping, `clamp((y + 24) / divisor, lowest, highest)`. */
export const SHIP_EYES = {
  LIFT_HEIGHT_UNITS:   6,
  LIFT_CENTRE_Y_UNITS: -24,
  LIFT_DIVISOR_UNITS:  8,
  LIFT_LOWEST_UNITS:   -3,
  LIFT_HIGHEST_UNITS:  2,
  SALUTE_HEIGHT_UNITS: 8,
  SALUTE_SHIFT_UNITS:  4,
} as const;

/** In the salute Flint stands tall: it leans back and is a little higher. */
export const SHIP_BODY = {
  SALUTE_LEAN_DEGREES:  -3,
  SALUTE_HEIGHT_FACTOR: 1.03,
} as const;
