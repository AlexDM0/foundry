import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** The Happy emote: how long it shows, and its moves; `sin(age / n)` names `n` a divisor. */
export const HAPPY_MOTION = {
  DURATION_MILLISECONDS:           1300,
  BOUNCE_HEIGHT_UNITS:             3,
  BOUNCE_HALF_PERIOD_MILLISECONDS: 300,
  BOUNCE_MILLISECONDS:             600,
} as const;

/** All that the emote draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const HAPPY_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      32,
  aboveFloorUnits: 64,
  belowFloorUnits: -3,
};
