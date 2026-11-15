/** The merge gesture of `02-animations.md`, "Merge": one cycle of pressing two blocks into one, in milliseconds. */
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
