import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** The Thinking emote: how long it shows and where the eyes look; the dots' entrance is shared. */
export const THINKING_MOTION = {
  DURATION_MILLISECONDS: 2400,
  EYE_LIFT_UNITS:        -3,
  EYE_SHIFT_UNITS:       4,
} as const;

/** All that the emote draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const THINKING_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      30.5,
  aboveFloorUnits: 65.5,
  belowFloorUnits: -3,
};
