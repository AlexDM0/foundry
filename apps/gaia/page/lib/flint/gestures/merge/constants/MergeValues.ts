import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** The merge gesture: one cycle of pressing two blocks into one, in milliseconds. */
export const MERGE_TIMELINE = {
  CYCLE_MILLISECONDS:        2600,
  FADE_IN_MILLISECONDS:      300,
  PRESS_STARTS_MILLISECONDS: 350,
  SNAP_MILLISECONDS:         900,
  SQUASH_ENDS_MILLISECONDS:  1100,
  LEAVES_MILLISECONDS:       1900,
  /** Reduced motion holds the merged block with its tick and the happy eyes. */
  STILL_MOMENT_MILLISECONDS: 1500,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const MERGE_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      56,
  aboveFloorUnits: 62,
  belowFloorUnits: -0.5,
};
