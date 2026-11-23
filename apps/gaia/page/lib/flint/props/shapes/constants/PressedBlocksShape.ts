/** Two blocks that hands press into one, in sprite units, for Flint facing right. */
export const PRESSED_BLOCKS_SHAPE = {
  X_UNITS:              28,
  TOP_BLOCK_Y_UNITS:    -42,
  BOTTOM_BLOCK_Y_UNITS: -18,
  MERGED_Y_UNITS:       -34,
  MERGED_HEIGHT_UNITS:  16,
  /** The snap keeps the sparks, a little larger than the small spark. */
  SPARK_SIDE_UNITS:     3,
  TICK_START_X_UNITS:   45,
  TICK_START_Y_UNITS:   -27,
} as const;
