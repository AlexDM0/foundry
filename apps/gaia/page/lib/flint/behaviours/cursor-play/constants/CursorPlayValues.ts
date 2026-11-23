/** Cursor play. The values are builder decisions. */
export const CURSOR_PLAY = {
  /** Cursor play stops when the pointer does not move for this long. */
  STILL_POINTER_MILLISECONDS:    3000,
  /** Flint stops walking when the pointer is this close, sideways. */
  STANDING_DISTANCE_UNITS:       24,
  /** Flint jumps when the pointer is this far above the body centre and within the jump width sideways. */
  JUMP_HEIGHT_UNITS:             44,
  JUMP_WIDTH_UNITS:              40,
  /** A next grab waits this long after a grab ends, so the hands do not snap shut without a pause. */
  PAUSE_AFTER_GRAB_MILLISECONDS: 300,
} as const;
