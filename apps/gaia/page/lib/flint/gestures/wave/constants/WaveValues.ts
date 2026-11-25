import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** Wave: one pentagon rocks with `rock = sin(t / ROCK_DIVISOR_MILLISECONDS)` while the "Hi!" mark shows. */
export const WAVE_GESTURE_VALUES = {
  DURATION_MILLISECONDS:     2200,
  HAND_RADIUS_UNITS:         6.5,
  HAND_CENTRE_X_UNITS:       27,
  HAND_CENTRE_Y_UNITS:       -34,
  ROCK_DIVISOR_MILLISECONDS: 100,
  ROCK_SWING_UNITS:          3,
  ROCK_TURN_DEGREES:         22,
  EYE_HEIGHT_UNITS:          9,
  /** In the sideways pose of a peek, the hand is this far ahead of the body centre on the screen. */
  PEEK_HAND_DISTANCE_UNITS:  21,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const WAVE_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      52,
  aboveFloorUnits: 64.5,
  belowFloorUnits: -3,
};
