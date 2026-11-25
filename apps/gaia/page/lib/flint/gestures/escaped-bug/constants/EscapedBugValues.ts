import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/**
 * Escaped bug: a bug leaves a landed block, Flint chases it with one pentagon and catches it on the third hit,
 * and traces it back to its block. In milliseconds from the start of the cycle, and in sprite units for Flint facing right.
 */
export const ESCAPED_BUG_TIMELINE = {
  CYCLE_MILLISECONDS:         4600,
  FADE_IN_MILLISECONDS:       300,
  ROCK_STARTS_MILLISECONDS:   300,
  ESCAPES_MILLISECONDS:       700,
  /** The surprise of the escape, its eye height and its hop, lasts as long as the one hop of the Surprised emote. */
  SURPRISE_ENDS_MILLISECONDS: 1000,
  /** As the Surprised emote, which shows the same "!". */
  EXCLAMATION_MILLISECONDS:   1100,
  HAND_APPEARS_MILLISECONDS:  1100,
  CAUGHT_MILLISECONDS:        2600,
  LIFTED_MILLISECONDS:        3200,
  FADES_OUT_MILLISECONDS:     3800,
  /**
   * Reduced motion holds the lifted bug above the block with the trace to it. The design holds 2900, as the hand lifts the bug; on the
   * lift around the block that frame shows the bug beside the shelf and nothing of the trace, so 3500 is held, a builder decision.
   */
  STILL_MOMENT_MILLISECONDS:  3500,
} as const;

/** The block turns by `ROCK_DEGREES × sin(ROCK_CYCLES × 2π × p)` around the middle of its bottom edge, on the shelf. */
export const ESCAPED_BUG_ROCK = {
  ROCK_DEGREES:  4,
  ROCK_CYCLES:   3,
  PIVOT_X_UNITS: 36,
  PIVOT_Y_UNITS: -24,
} as const;

/** The route of the bug: it runs in straight lines from each point to the next, reaching each at its moment. */
export const ESCAPED_BUG_ROUTE = [
  { X_UNITS: 43, Y_UNITS: -28, AT_MILLISECONDS: 700 },
  { X_UNITS: 52, Y_UNITS: -26, AT_MILLISECONDS: 1100 },
  { X_UNITS: 48, Y_UNITS: -6, AT_MILLISECONDS: 1400 },
  { X_UNITS: 28, Y_UNITS: -6, AT_MILLISECONDS: 1900 },
  { X_UNITS: 40, Y_UNITS: -6, AT_MILLISECONDS: 2300 },
  { X_UNITS: 34, Y_UNITS: -6, AT_MILLISECONDS: 2600 },
] as const;

/**
 * From the catch the hand lifts the bug around the block and the shelf, through these points, to its lifted place above the block: out
 * past the shelf's end, up beside it, and back over the block. The design lifts it straight up, through the shelf and the block; the way
 * around them is a builder decision.
 */
export const ESCAPED_BUG_LIFT_WAYPOINTS = [
  { X_UNITS: 58, Y_UNITS: -12, AT_MILLISECONDS: 2800 },
  { X_UNITS: 58, Y_UNITS: -40, AT_MILLISECONDS: 3000 },
] as const;

/** The hits of the hand; the last one has the bug. */
export const ESCAPED_BUG_HITS = [
  { X_UNITS: 46, Y_UNITS: -8, AT_MILLISECONDS: 1600 },
  { X_UNITS: 30, Y_UNITS: -8, AT_MILLISECONDS: 2150 },
  { X_UNITS: 34, Y_UNITS: -8, AT_MILLISECONDS: 2600 },
] as const;

export const ESCAPED_BUG_HAND = {
  RADIUS_UNITS:                6.5,
  /** Between hits the hand waits this far above the next hit point. */
  RAISE_UNITS:                 8,
  /** A hit falls from the raised place in the time of the stamp's fall in Make a ticket, then rests on the hit point. */
  SLAM_MILLISECONDS:           120,
  REST_MILLISECONDS:           150,
  /** The caught bug hangs below the centre of the hand: just under it at the catch, below its lower edge once lifted. */
  CAUGHT_BUG_BELOW_HAND_UNITS: 2,
  LIFTED_BUG_BELOW_HAND_UNITS: 7.5,
} as const;

/**
 * The shelf, the landed block on it, and the trace back to the block. The design lifts the bug to (34, -30), inside the block; it is
 * lifted above the block instead, so the dashed line to the block can show.
 */
export const ESCAPED_BUG_SHAPE = {
  SHELF_START_X_UNITS:      26,
  SHELF_END_X_UNITS:        54,
  SHELF_Y_UNITS:            -24,
  SHELF_STROKE_UNITS:       1.6,
  BLOCK_X_UNITS:            30,
  BLOCK_Y_UNITS:            -32,
  BLOCK_TOP_MIDDLE_X_UNITS: 36,
  LIFTED_BUG_X_UNITS:       34,
  LIFTED_BUG_Y_UNITS:       -42,
  TRACE_STROKE_UNITS:       1,
  /** As the dashed outline of a draft. */
  TRACE_DASH_UNITS:         2,
  TRACE_GAP_UNITS:          2,
  /** An equilateral warning triangle of side 3, its centroid on the top right corner of the block: its top 2/3 of its height above it. */
  WARNING_SIDE_UNITS:       3,
  WARNING_TOP_RISE_UNITS:   Math.sqrt(3),
  WARNING_BASE_DROP_UNITS:  Math.sqrt(3) / 2,
  WARNING_CENTRE_X_UNITS:   42,
  WARNING_CENTRE_Y_UNITS:   -32,
} as const;

export const ESCAPED_BUG_EYES = {
  SURPRISED_HEIGHT_UNITS: 10,
  CHASE_HEIGHT_UNITS:     4,
  CHASE_SLANT_DEGREES:    12,
  /** While Flint chases, the eye shift is `SHIFT_BASE_UNITS + (bug x - SHIFT_ORIGIN_X_UNITS) / SHIFT_DIVISOR_UNITS`. */
  SHIFT_BASE_UNITS:       4,
  SHIFT_ORIGIN_X_UNITS:   26,
  SHIFT_DIVISOR_UNITS:    8,
  HOLD_HEIGHT_UNITS:      6,
  TRACE_SLANT_DEGREES:    8,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const ESCAPED_BUG_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      64.5,
  aboveFloorUnits: 77,
  belowFloorUnits: -3,
};
