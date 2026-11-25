import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** The spark companion: one spark for each running Watcher, along Flint's back; `sin(t / n)` names `n` a divisor. */
export const WATCHER_SPARK = {
  MAXIMUM_COUNT: 4,
  /** Spark n rests at place n: up along Flint's back, close enough that the sparks stay in a strip's slot. */
  PLACES:        [
    { X_UNITS: -7, Y_UNITS: -49 },
    { X_UNITS: -13, Y_UNITS: -42 },
    { X_UNITS: -18, Y_UNITS: -34.5 },
    { X_UNITS: -22, Y_UNITS: -27 },
  ],
  BOB_UNITS:                    2,
  BOB_DIVISOR_MILLISECONDS:     500,
  /** Each spark bobs this far behind the one before it, in radians of the bob. */
  BOB_PHASE_PER_SPARK:          1.7,
  TURN_START_DEGREES:           45,
  TURN_DEGREES_PER_MILLISECOND: 0.03,
  PULSE_FACTOR:                 0.08,
  PULSE_DIVISOR_MILLISECONDS:   300,
} as const;

/** All that the sparks draw at their most, with Flint's body, from its bottom tip for Flint facing right: the room they take. */
export const WATCHER_SPARK_EXTENT: DrawnExtent = {
  backUnits:       25.5,
  frontUnits:      20,
  aboveFloorUnits: 62.5,
  belowFloorUnits: -3,
};
