import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/**
 * Bank the fire: the stop of Hephaestus, an entrance of 2000 ms and then a steady pose
 * in which Flint is dark, landed and awake a little; in sprite units, for Flint facing right, and milliseconds; `sin(t / n)` names `n` a
 * divisor.
 */
export const BANK_FIRE = {
  ENTRANCE_MILLISECONDS:     2000,
  STILL_MOMENT_MILLISECONDS: 2500,
  HOVER_UNITS:               0,
  LEAN_DEGREES:              -5,
} as const;

/**
 * One square pats the top of Flint two times: DEPTH_UNITS down and back, PAT_MILLISECONDS each. The design puts it at (10, -56), where
 * its lower corner never reaches Flint; it pats over the tip leaned back by -5 instead, a builder decision, so that the corner meets the
 * tip at the bottom of each pat, also once the body is 0.97 high.
 */
export const PATS = {
  HAND_CENTRE_X_UNITS:    -4,
  HAND_CENTRE_Y_UNITS:    -57.5,
  HAND_RADIUS_UNITS:      5.5,
  HAND_TURN_DEGREES:      0,
  DEPTH_UNITS:            3.5,
  /** Each pat starts here; the hand first grows to its place. */
  STARTS_MILLISECONDS:    [200, 500],
  PAT_MILLISECONDS:       300,
  HAND_GOES_MILLISECONDS: 800,
} as const;

/** The cooled tint after each pat, then the tint of the banked fire, which the amount reaches by the end of the entrance. */
export const COOLING = {
  TINT_AMOUNTS_AFTER_PATS:        [0.3, 0.6],
  BANKED_TINT_AMOUNT:             0.7,
  /** After the first pat the body is this much lower, and stays so: it does not breathe. */
  HEIGHT_FACTOR:                  0.97,
  EYES_CLOSE_STARTS_MILLISECONDS: 800,
  BANKED_EYE_HEIGHT_UNITS:        2.5,
} as const;

/**
 * From the end of the entrance the inner glow is GLOW_BASE_OPACITY + GLOW_SWING_OPACITY × sin(t / GLOW_DIVISOR_MILLISECONDS). It fades
 * in from GLOW_FADE_IN_STARTS_MILLISECONDS and is full at the end of the entrance.
 */
export const BANKED_GLOW = {
  GLOW_BASE_OPACITY:                0.35,
  GLOW_SWING_OPACITY:               0.15,
  GLOW_DIVISOR_MILLISECONDS:        900,
  GLOW_FADE_IN_STARTS_MILLISECONDS: 1600,
} as const;

/** Only ember 2 of Sleep rises, from the end of the entrance, with a smaller side, and only this share of Sleep's rise. */
export const BANKED_EMBER = {
  EMBER_INDEX: 2,
  SIDE_UNITS:  2.5,
  RISE_SHARE:  0.6,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const BANK_FIRE_EXTENT: DrawnExtent = {
  backUnits:       22.5,
  frontUnits:      20,
  aboveFloorUnits: 64.5,
  belowFloorUnits: 0,
};
