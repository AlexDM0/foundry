import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/**
 * Review: the hand that holds the lens, and the verdicts; the lens reads as `flint/gestures/constants/ReadingLens.ts`
 * gives.
 */
export const REVIEW_GESTURE_VALUES = {
  HAND_RADIUS_UNITS:      5,
  HAND_TURN_DEGREES:      0,
  /** The normal variant's cross. */
  CROSS_EYE_HEIGHT_UNITS: 4,
  CROSS_LEAN_DEGREES:     9,
  /** The busy variant's verdict lifts the sheet by `PAGE_TURN_RISE_UNITS × sin(π × verdict progress)`. */
  PAGE_TURN_RISE_UNITS:   6,
} as const;

/** The angry jab `JAB_UNITS × max(0, sin(t / divisor))` comes off the lens's x and y; the sheet moves down by its share of it. */
export const REVIEW_JAB = {
  JAB_UNITS:                3,
  JAB_DIVISOR_MILLISECONDS: 45,
  SHEET_SHARE:              0.5,
} as const;

/** Per variant: the time to read one line, the time of the verdict, and the pages behind the sheet. */
export const REVIEW_PACES = {
  normal: { LINE_MILLISECONDS: 800, VERDICT_MILLISECONDS: 800, STACKED_PAGE_COUNT: 0 },
  busy:   { LINE_MILLISECONDS: 280, VERDICT_MILLISECONDS: 350, STACKED_PAGE_COUNT: 1 },
  angry:  { LINE_MILLISECONDS: 500, VERDICT_MILLISECONDS: 900, STACKED_PAGE_COUNT: 3 },
} as const;

/** All that each form of the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const REVIEW_EXTENTS = {
  REVIEW: {
    backUnits:       20,
    frontUnits:      53.5,
    aboveFloorUnits: 66,
    belowFloorUnits: -3,
  },
  REVIEW_BUSY: {
    backUnits:       20,
    frontUnits:      55.5,
    aboveFloorUnits: 72.5,
    belowFloorUnits: -2.5,
  },
  REVIEW_ANGRY: {
    backUnits:       20,
    frontUnits:      58.5,
    aboveFloorUnits: 69.5,
    belowFloorUnits: -3,
  },
} as const satisfies Readonly<Record<string, DrawnExtent>>;
