/** Reorder: one loop in which the third card of a stack moves to the top; in milliseconds. */
export const REORDER_TIMELINE = {
  CYCLE_MILLISECONDS:        3600,
  FADE_IN_MILLISECONDS:      300,
  REACH_STARTS_MILLISECONDS: 300,
  PULL_STARTS_MILLISECONDS:  800,
  LIFT_STARTS_MILLISECONDS:  1200,
  PUSH_STARTS_MILLISECONDS:  1700,
  PUSH_ENDS_MILLISECONDS:    2000,
  HAPPY_STARTS_MILLISECONDS: 2100,
  LEAVES_MILLISECONDS:       2700,
  /** Reduced motion holds the card on top of the stack, the happy eyes and the hand going away. */
  STILL_MOMENT_MILLISECONDS: 2200,
} as const;

/**
 * A stack of four cards, each with a tab at its left end; the card that moves is the third, with a tab in the body colour. The design
 * pulls the card 12 out, where it still overlaps the stack and its lift crosses the cards above it; it is pulled its whole width, 18, so it
 * clears the stack before it rises, a builder decision.
 */
export const REORDER_STACK = {
  CARD_X_UNITS:           30,
  CARD_Y_UNITS:           [-42, -35, -28, -21],
  CARD_WIDTH_UNITS:       18,
  CARD_HEIGHT_UNITS:      5,
  CARD_CORNER_UNITS:      1,
  CARD_STROKE_UNITS:      1,
  TAB_WIDTH_UNITS:        3,
  MOVED_CARD_INDEX:       2,
  PULL_UNITS:             18,
  LIFTED_Y_UNITS:         -49,
  /** The cards above the moved one go this far down, into the place it left. */
  CARDS_ABOVE_DROP_UNITS: 7,
} as const;

/** One pentagon holds the moved card at its right end, this far beyond it, at the card's middle height. */
export const REORDER_HAND = {
  CORNER_COUNT:      5,
  RADIUS_UNITS:      5.5,
  BEYOND_CARD_UNITS: 2,
} as const;

/** The eyes follow the card up: the lift goes from 0 to the highest lift while the card is lifted. */
export const REORDER_EYES = {
  HEIGHT_UNITS:       6,
  HIGHEST_LIFT_UNITS: -3,
} as const;
