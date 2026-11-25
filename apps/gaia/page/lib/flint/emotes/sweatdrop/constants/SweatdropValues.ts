import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** The Sweatdrop emote: how long it shows and where the eyes look; the drop's entrance is shared. */
export const SWEATDROP_MOTION = {
  DURATION_MILLISECONDS: 1500,
  EYE_HEIGHT_UNITS:      6,
  EYE_SHIFT_UNITS:       -1,
} as const;

/** All that the emote draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const SWEATDROP_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      23.5,
  aboveFloorUnits: 66.5,
  belowFloorUnits: -3,
};
