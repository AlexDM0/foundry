/**
 * The sparks of a snap (`02-animations.md`, "Merge"), which every gesture that snaps or flares shares: four small sparks fly apart on their ways from a
 * centre, turning, and fade; `travel factor` stretches how far they fly.
 */
import { BLOCK_PRESS } from './BlockPress.ts';

export const SNAP_SPARKS = {
  FLIGHT_MILLISECONDS: 450,
  /** The centre of the snap, between the hands that press. */
  CENTRE_X_UNITS:      BLOCK_PRESS.CENTRE_X_UNITS,
  CENTRE_Y_UNITS:      -26,
  START_X_UNITS:       7,
  TRAVEL_X_UNITS:      14,
  START_Y_UNITS:       2,
  TRAVEL_Y_UNITS:      12,
  TURN_DEGREES:        180,
  /** The (wx, wy) way of each spark. */
  WAYS:                [
    { X: -1, Y: -0.5 },
    { X: 1, Y: -0.5 },
    { X: -1, Y: 0.6 },
    { X: 1, Y: 0.6 },
  ],
} as const;
