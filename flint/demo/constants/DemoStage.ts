/** The values of the demo page that its markup does not hold: the floating grab target's motion, the sizes it offers, and its card. */
export const FLOATING_TARGET = {
  /** As the playground's square: it bobs up and down and turns. */
  BOB_PIXELS:                5,
  BOB_DIVISOR_MILLISECONDS:  500,
  TURN_DIVISOR_MILLISECONDS: 20,
  FULL_TURN_DEGREES:         360,
} as const;

/** The two sizes the demo shows, in pixels for one sprite unit. */
export const DEMO_SIZES = Object.freeze([1, 0.5]);

export const DEMO_CARD_HABITAT_KIND = 'card';
