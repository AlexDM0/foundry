import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** The Doubt emote: how long it shows, and its moves; `sin(age / n)` names `n` a divisor. */
export const DOUBT_MOTION = {
  DURATION_MILLISECONDS:  1500,
  RIGHT_EYE_HEIGHT_UNITS: 5,
  ADDED_LEAN_DEGREES:     7,
} as const;

/** All that the emote draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const DOUBT_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      28,
  aboveFloorUnits: 70.5,
  belowFloorUnits: -3,
};
