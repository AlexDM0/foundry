/** Customs of `06-more-animations.md`: a loop that checks three claims against a crate, in milliseconds and sprite units, facing right. */
export const CUSTOMS_TIMELINE = {
  CYCLE_MILLISECONDS:              5200,
  FADE_IN_MILLISECONDS:            300,
  FIRST_CLAIM_STARTS_MILLISECONDS: 400,
  CLAIM_INTERVAL_MILLISECONDS:     1300,
  VERDICT_STARTS_MILLISECONDS:     4300,
  FADE_OUT_STARTS_MILLISECONDS:    4700,
  /** Reduced motion holds the first claim: the item lifted, the eyes on the list, its tick in the box. */
  STILL_MOMENT_MILLISECONDS:       1200,
} as const;

/** The phases of one claim, from its start. */
export const CUSTOMS_CLAIM_TIMELINE = {
  REACHED_MILLISECONDS:         350,
  LIFTED_MILLISECONDS:          700,
  VERDICT_MILLISECONDS:         800,
  PUT_BACK_STARTS_MILLISECONDS: 900,
  ENDS_MILLISECONDS:            1200,
} as const;

/** One pentagon reaches into the crate and lifts the item to Flint's eyes; when it finds nothing it turns, searching. */
export const CUSTOMS_HAND = {
  RADIUS_UNITS:        5.5,
  CRATE_X_UNITS:       39,
  CRATE_Y_UNITS:       -18,
  LIFTED_Y_UNITS:      -30,
  SEARCH_TURN_DEGREES: 15,
  /** The search turns by `SEARCH_TURN_DEGREES × sin(SEARCH_HALF_TURNS × π × p)`. */
  SEARCH_HALF_TURNS:   4,
} as const;

export const CUSTOMS_EYES = {
  /** Review's height for reading; Customs reads its list alike. */
  WORKING_HEIGHT_UNITS:    6,
  CRATE_LIFT_UNITS:        3,
  LIST_LIFT_UNITS:         -3,
  NOT_FOUND_HEIGHT_UNITS:  5,
  NOT_FOUND_SLANT_DEGREES: 12,
  REFUSED_HEIGHT_UNITS:    4,
} as const;

/** A refused item makes Flint lean further in to its work. */
export const CUSTOMS_BODY = { REFUSED_LEAN_DEGREES: 9 } as const;

/** The crate, its two open flaps and the item, a small work-in-progress block, by its centre. */
export const CUSTOMS_CRATE_SHAPE = {
  POINTS: [
    { x: 28, y: -24 },
    { x: 50, y: -24 },
    { x: 50, y: -10 },
    { x: 28, y: -10 },
  ],
  STROKE_UNITS: 1.4,
  FLAPS:        [
    {
      FROM_X_UNITS: 28, FROM_Y_UNITS: -24, TO_X_UNITS: 24, TO_Y_UNITS: -30,
    },
    {
      FROM_X_UNITS: 50, FROM_Y_UNITS: -24, TO_X_UNITS: 54, TO_Y_UNITS: -30,
    },
  ],
  ITEM_WIDTH_UNITS:  6,
  ITEM_HEIGHT_UNITS: 4,
} as const;

/**
 * The list of claims: each claim is a box and a line. A claim's verdict, a small tick or cross, is centred on its box. Facing left, the
 * box and the line change ends within the list, so on the screen the box stays at the left of its line.
 */
export const CUSTOMS_LIST_SHAPE = {
  X_UNITS:               30,
  Y_UNITS:               -52,
  WIDTH_UNITS:           16,
  HEIGHT_UNITS:          20,
  STROKE_UNITS:          1.2,
  CLAIM_Y_UNITS:         [-46, -40, -34],
  BOX_X_UNITS:           32.5,
  BOX_SIDE_UNITS:        1.8,
  /** The outline of an off lamp, the thinnest outline of the vocabulary. */
  BOX_STROKE_UNITS:      0.8,
  LINE_START_X_UNITS:    36,
  LINE_END_X_UNITS:      43,
  /** The printed lines of the sheet. */
  LINE_STROKE_UNITS:     1.5,
  /** The tick's corner sits below the middle of its height: its start goes this far below the centre of the box. */
  SMALL_TICK_DROP_UNITS: 0.2,
} as const;
