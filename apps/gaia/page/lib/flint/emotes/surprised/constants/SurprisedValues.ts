import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** The Surprised emote: how long it shows, and its moves; `sin(age / n)` names `n` a divisor. */
export const SURPRISED_MOTION = {
  DURATION_MILLISECONDS: 1100,
  EYE_HEIGHT_UNITS:      10,
} as const;

/** All that the emote draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const SURPRISED_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      24.5,
  aboveFloorUnits: 76,
  belowFloorUnits: -3,
};
