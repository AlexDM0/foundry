/**
 * The shared vocabulary: a prop keeps one meaning in all animations, and these are its shapes, in sprite
 * units, for Flint facing right.
 */

/** The paper: the sheet, the ticket and a stacked page share this outline. */
export const PAPER_SHAPE = {
  POINTS: [
    { x: 28, y: -46 },
    { x: 48, y: -42 },
    { x: 48, y: -10 },
    { x: 28, y: -14 },
  ],
  STROKE_UNITS:  1.2,
  /** Written lines go down this much for each unit of length, parallel to the paper's top edge. */
  SLOPE:         0.2,
  /** The header of a ready ticket: 1 unit in from the left, top and right edges of the paper. */
  HEADER_POINTS: [
    { x: 29, y: -44.8 },
    { x: 47, y: -41.2 },
    { x: 47, y: -37.6 },
    { x: 29, y: -41.2 },
  ],
  DRAFT_DASH_UNITS:   2,
  DRAFT_GAP_UNITS:    2,
  DRAFT_FILL_OPACITY: 0.55,
  CENTRE_X_UNITS:     38,
  CENTRE_Y_UNITS:     -28,
  MINI_SHEET_SCALE:   0.55,
} as const;

export const BLOCK_SHAPE = {
  WIDTH_UNITS:         12,
  HEIGHT_UNITS:        8,
  CORNER_RADIUS_UNITS: 1,
} as const;

/** A Watcher: a square turned 45 degrees with a light core. */
export const SPARK_SHAPE = {
  SIDE_UNITS:      4,
  CORE_SIDE_UNITS: 1.6,
  TURN_DEGREES:    45,
} as const;

/** An effect, as the sparks of Merge; a small spark that flies out turns this far over its flight. */
export const SMALL_SPARK_SHAPE = {
  SIDE_UNITS:          2.5,
  FLIGHT_TURN_DEGREES: 180,
} as const;

/** A plug: a graphite block with two prongs out of its far edge, the drops of the prongs from its top edge. */
export const PLUG_SHAPE = {
  WIDTH_UNITS:        6,
  HEIGHT_UNITS:       4,
  PRONG_LENGTH_UNITS: 2,
  PRONG_HEIGHT_UNITS: 0.8,
  PRONG_DROPS_UNITS:  [0.8, 2.4],
} as const;

/** One gate check; a running lamp pulses by `sin(t / RUNNING_PULSE_DIVISOR_MILLISECONDS)`. */
export const LAMP_SHAPE = {
  RADIUS_UNITS:                       2.2,
  OFF_STROKE_UNITS:                   0.8,
  RUNNING_BASE_OPACITY:               0.6,
  RUNNING_PULSE_OPACITY:              0.4,
  RUNNING_PULSE_DIVISOR_MILLISECONDS: 90,
} as const;

export const ENVELOPE_SHAPE = {
  WIDTH_UNITS:       14,
  HEIGHT_UNITS:      9,
  STROKE_UNITS:      1.2,
  FLAP_DEPTH_UNITS:  5,
  FLAP_STROKE_UNITS: 1,
  SEAL_SIDE_UNITS:   2.5,
} as const;

/**
 * A finding: a hexagon with four legs, two on each side, that wiggles by `sin(t / WIGGLE_DIVISOR_MILLISECONDS)`. Its legs read only at 1
 * pixel for one unit; at 0.5 the bug reads as a small dark mark, which is enough for its gestures: a choice, not an oversight.
 */
export const BUG_SHAPE = {
  RADIUS_UNITS:                2.2,
  CORNER_COUNT:                6,
  LEG_LENGTH_UNITS:            1.6,
  LEG_STROKE_UNITS:            0.7,
  /** Each leg starts on the edge of the body and points out at its angle, 0 forward, positive down. */
  LEG_ANGLES_DEGREES:          [-30, 30, 150, 210],
  WIGGLE_DEGREES:              12,
  WIGGLE_DIVISOR_MILLISECONDS: 50,
} as const;

/** A budget: the level is a bar inside the gauge, from its bottom. */
export const GAUGE_SHAPE = {
  WIDTH_UNITS:         6,
  HEIGHT_UNITS:        24,
  CORNER_RADIUS_UNITS: 1.5,
  STROKE_UNITS:        1.4,
  LEVEL_INSET_UNITS:   1,
  LEVEL_WIDTH_UNITS:   4,
  FULL_LEVEL_UNITS:    22,
} as const;

/** A verdict, drawn from its start point and never mirrored; a small one is the same shape at `SMALL_SCALE`. */
export const TICK_SHAPE = {
  RELATIVE_PATH: 'l3 3 l6 -7',
  WIDTH_UNITS:   9,
  STROKE_UNITS:  2.4,
} as const;

export const CROSS_SHAPE = {
  SIDE_UNITS:   7,
  STROKE_UNITS: 2.2,
} as const;

export const VERDICT_SHAPE = { SMALL_SCALE: 0.45 } as const;

export const WRITTEN_LINE_SHAPE = { STROKE_UNITS: 1.5 } as const;
