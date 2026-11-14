/** Two blocks that hands press into one (`01-character.md`, the Merge blocks), in sprite units, for Flint facing right. */
export const PRESSED_BLOCKS_SHAPE = {
  X_UNITS:              28,
  TOP_BLOCK_Y_UNITS:    -42,
  BOTTOM_BLOCK_Y_UNITS: -18,
  MERGED_Y_UNITS:       -34,
  MERGED_HEIGHT_UNITS:  16,
  /** The snap keeps the sparks of `02-animations.md`, a little larger than the small spark of `06-more-animations.md`. */
  SPARK_SIDE_UNITS:     3,
  TICK_START_X_UNITS:   45,
  TICK_START_Y_UNITS:   -27,
} as const;
