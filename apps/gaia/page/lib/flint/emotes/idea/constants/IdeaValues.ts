import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** The Idea emote: how long it shows, and its moves; `sin(age / n)` names `n` a divisor. */
export const IDEA_MOTION = {
  DURATION_MILLISECONDS:             1600,
  EYE_HEIGHT_UNITS:                  10,
  RAYS_START_MILLISECONDS:           260,
  RAYS_OPACITY:                      0.35,
  RAYS_FLICKER_OPACITY:              0.2,
  RAYS_FLICKER_DIVISOR_MILLISECONDS: 130,
} as const;

/** All that the emote draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const IDEA_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      37.5,
  aboveFloorUnits: 81,
  belowFloorUnits: -3,
};
