import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** Waiver: one loop in which Flint initials a failed verdict and it becomes a grey tick; in milliseconds. */
export const WAIVER_TIMELINE = {
  CYCLE_MILLISECONDS:          3400,
  FADE_IN_MILLISECONDS:        400,
  WRITING_STARTS_MILLISECONDS: 400,
  WRITING_ENDS_MILLISECONDS:   1400,
  GREYED_MILLISECONDS:         1700,
  TICK_SHOWN_MILLISECONDS:     1900,
  DOUBT_ENDS_MILLISECONDS:     2700,
  /** Reduced motion holds the grey tick and the look of doubt. */
  STILL_MOMENT_MILLISECONDS:   2200,
} as const;

/**
 * The initials, the path `m0 0 q2 -5 3.5 0 q1.5 4 3 -1 l2 2` from its start point: each stroke a quadratic curve relative to the end of the
 * one before, the last, a straight line, given with its control point at its middle. Each curve is drawn as this many straight steps. The
 * design starts them at (30, -53), where the pen covers the cross while it writes and their tail touches the tick; they start 3 further
 * left, a builder decision.
 */
export const WAIVER_INITIALS = {
  START_X_UNITS: 27,
  START_Y_UNITS: -53,
  STROKES:       [
    {
      CONTROL_X_UNITS: 2, CONTROL_Y_UNITS: -5, END_X_UNITS: 3.5, END_Y_UNITS: 0
    },
    {
      CONTROL_X_UNITS: 1.5, CONTROL_Y_UNITS: 4, END_X_UNITS: 3, END_Y_UNITS: -1
    },
    {
      CONTROL_X_UNITS: 1, CONTROL_Y_UNITS: 1, END_X_UNITS: 2, END_Y_UNITS: 2
    },
  ],
  STEPS_PER_STROKE: 12,
  STROKE_UNITS:     1.3,
} as const;

/** While Flint writes, it looks up at the initials; then doubt: a lean and one narrower eye, and no happy eyes. */
export const WAIVER_POSE = {
  WRITING_HEIGHT_UNITS:         6,
  WRITING_LIFT_UNITS:           -4,
  DOUBT_LEAN_DEGREES:           7,
  DOUBT_RIGHT_EYE_HEIGHT_UNITS: 5,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const WAIVER_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      50.5,
  aboveFloorUnits: 66.5,
  belowFloorUnits: -3,
};
