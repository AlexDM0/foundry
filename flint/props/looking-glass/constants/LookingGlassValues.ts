/** The looking glass of `01-character.md`, in sprite units, for Flint facing right. */
export const LOOKING_GLASS_SHAPE = {
  LENS_RADIUS_UNITS:                5.5,
  LENS_OPACITY:                     0.7,
  RING_STROKE_UNITS:                1.6,
  HANDLE_STROKE_UNITS:              2.4,
  /** The hand holds the glass at this offset from the lens centre, exactly, on every frame. */
  GRIP_OFFSET_X_UNITS:              -8,
  GRIP_OFFSET_Y_UNITS:              8,
  /** The handle shows only while the hand that holds it is larger than this. */
  HANDLE_MINIMUM_HAND_RADIUS_UNITS: 2,
  RESTING_CENTRE_X_UNITS:           38,
  RESTING_CENTRE_Y_UNITS:           -30,
} as const;
