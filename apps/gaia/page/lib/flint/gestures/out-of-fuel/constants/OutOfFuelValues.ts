import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/**
 * Out of fuel and Refuel: a steady pose in which Flint waits by an empty gauge, and the
 * one action that fills it; in sprite units, for Flint facing right, and milliseconds; `sin(t / n)` names `n` a divisor.
 */
export const OUT_OF_FUEL = {
  STILL_MOMENT_MILLISECONDS:          3000,
  TINT_AMOUNT:                        0.85,
  HOVER_UNITS:                        0,
  LEAN_DEGREES:                       -4,
  /** Height × (1 - SAG_HEIGHT_FACTOR × sin(t / SAG_DIVISOR_MILLISECONDS)). */
  SAG_HEIGHT_FACTOR:                  0.02,
  SAG_DIVISOR_MILLISECONDS:           900,
  EYE_HEIGHT_UNITS:                   4,
  EYE_LIFT_UNITS:                     1,
  EYE_SHIFT_UNITS:                    5,
  /** A slow blink closes the eyes and opens them again in the last `BLINK_MILLISECONDS` of each interval. */
  BLINK_INTERVAL_MILLISECONDS:        3000,
  BLINK_MILLISECONDS:                 400,
  /** Flint looks at the user in the last `LOOK_AT_USER_MILLISECONDS` of each interval. */
  LOOK_AT_USER_INTERVAL_MILLISECONDS: 5000,
  LOOK_AT_USER_MILLISECONDS:          600,
  LOOK_AT_USER_EYE_SHIFT_UNITS:       1,
  LOOK_AT_USER_EYE_HEIGHT_UNITS:      5,
} as const;

/** The gauge of the budget: nearly empty, its level blinking in crimson. */
export const EMPTY_GAUGE = {
  X_UNITS:                  32,
  Y_UNITS:                  -40,
  /** The design's level is 0.06, under one pixel at 0.5 pixels for one unit; 0.12 keeps the alarm readable, a builder decision. */
  LEVEL:                    0.12,
  BRIGHT_LEVEL_OPACITY:     1,
  DIM_LEVEL_OPACITY:        0.4,
  /** The level is bright for one span and dim for the next, in turn. */
  LEVEL_BLINK_MILLISECONDS: 350,
} as const;

/** Three marks of 2 at the quarters of the gauge's height, out from its right side. */
export const GAUGE_MARKS = {
  QUARTERS:      [1, 2, 3],
  QUARTER_COUNT: 4,
  LENGTH_UNITS:  2,
  STROKE_UNITS:  1,
} as const;

export const REFUEL = {
  DURATION_MILLISECONDS:     1600,
  STILL_MOMENT_MILLISECONDS: 900,
  FULL_LEVEL:                1,
  FILLED_MILLISECONDS:       700,
  FLARE_MILLISECONDS:        700,
  FLARE_GLOW_OPACITY:        0.7,
  GLOW_OUT_MILLISECONDS:     1300,
  /** The hop of the flare, as the hop of the Surprised emote: HOP_UNITS × sin(π × p) over HOP_MILLISECONDS. */
  HOP_UNITS:                 6,
  HOP_MILLISECONDS:          300,
  SWELL_FACTOR:              1.06,
  SWELL_MILLISECONDS:        150,
  FLARE_EYE_HEIGHT_UNITS:    10,
  HAPPY_EYES_MILLISECONDS:   900,
  GAUGE_FADES_MILLISECONDS:  1100,
} as const;

/** Four small sparks of the flare, from the body centre on the ways of the Merge sparks with 1.5 times their travel. */
export const REFUEL_SPARKS = {
  CENTRE_X_UNITS: 0,
  CENTRE_Y_UNITS: -24,
  TRAVEL_FACTOR:  1.5,
} as const;

/** All that each form of the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const OUT_OF_FUEL_EXTENTS = {
  OUT_OF_FUEL: {
    backUnits:       22,
    frontUnits:      40.5,
    aboveFloorUnits: 57.5,
    belowFloorUnits: 0,
  },
  REFUEL: {
    backUnits:       28.5,
    frontUnits:      40.5,
    aboveFloorUnits: 61.5,
    belowFloorUnits: 0,
  },
} as const satisfies Readonly<Record<string, DrawnExtent>>;
