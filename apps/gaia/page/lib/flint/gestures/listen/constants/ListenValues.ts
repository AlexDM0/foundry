import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** Quiet job: Flint listens at a dark block, taps it, and wonders; sprite units, for Flint facing right. */
export const LISTEN_TIMELINE = {
  CYCLE_MILLISECONDS:        3600,
  FADE_IN_MILLISECONDS:      300,
  LISTENS_FROM_MILLISECONDS: 300,
  TAPS_FROM_MILLISECONDS:    1500,
  TAP_STARTS_MILLISECONDS:   [1600, 1900],
  TAP_MILLISECONDS:          100,
  /** The question mark shows from here to the end of the cycle. */
  DOUBT_FROM_MILLISECONDS:   2300,
  /** Reduced motion holds the question mark, fully grown, with the hand gone. */
  STILL_MOMENT_MILLISECONDS: 2600,
} as const;

export const LISTEN_POSE = {
  LEAN_DEGREES:                 12,
  EYE_HEIGHT_UNITS:             3,
  RIGHT_EYE_HEIGHT_UNITS:       6,
  EYE_SHIFT_UNITS:              6,
  TAPPER_CENTRE_X_UNITS:        37,
  TAPPER_CENTRE_Y_UNITS:        -38,
  TAPPER_RADIUS_UNITS:          5.5,
  TAPPER_TURN_DEGREES:          180,
  /** A tap moves the hand this far down and back. */
  TAP_DEPTH_UNITS:              5,
  BLOCK_TAP_DROP_UNITS:         0.8,
  DOUBT_LEAN_DEGREES:           5,
  DOUBT_RIGHT_EYE_HEIGHT_UNITS: 5,
} as const;

/** A graphite block, larger than the block of the shared vocabulary; its place is its top left corner. */
export const LISTEN_BLOCK_SHAPE = {
  X_UNITS:      30,
  Y_UNITS:      -30,
  WIDTH_UNITS:  14,
  HEIGHT_UNITS: 10,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const LISTEN_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      44,
  aboveFloorUnits: 71.5,
  belowFloorUnits: -3,
};
