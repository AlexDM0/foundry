/** Gate failed of `06-more-animations.md`: one action in which a failed check falls onto the keyboard; sprite units, Flint facing right. */
export const GATE_FAILED_TIMELINE = {
  DURATION_MILLISECONDS:           2400,
  NOTE_LANDS_MILLISECONDS:         350,
  KEYBOARD_JOLT_ENDS_MILLISECONDS: 450,
  FLINCH_ENDS_MILLISECONDS:        600,
  STARTLED_EYES_END_MILLISECONDS:  700,
  RECOIL_ENDS_MILLISECONDS:        900,
  SIGH_STARTS_MILLISECONDS:        1500,
  /** The sigh ends, the hands go back to the typing places and the note fades out. */
  SIGH_ENDS_MILLISECONDS:          2100,
  /** Reduced motion holds Flint looking down at the note, the hands drawn back. */
  STILL_MOMENT_MILLISECONDS:       1000,
} as const;

export const GATE_FAILED_POSE = {
  KEYBOARD_JOLT_UNITS:       1.6,
  STARTLED_EYE_HEIGHT_UNITS: 10,
  /** The design gives no lift while Flint is startled; the Surprised emote has none. */
  STARTLED_EYE_LIFT_UNITS:   0,
  FLINCH_UNITS:              4,
  RECOIL_LEAN_DEGREES:       -4,
  /** Upright until the hands are back on the keys: at the working lean the body would cover the drawn-back hands and an eye. */
  SETTLED_LEAN_DEGREES:      0,
  RECOIL_HAND_RADIUS_UNITS:  4.5,
  NEAR_HAND_RECOIL_X_UNITS:  16,
  NEAR_HAND_RECOIL_Y_UNITS:  -16,
  FAR_HAND_RECOIL_X_UNITS:   20,
  FAR_HAND_RECOIL_Y_UNITS:   -19,
  DOWNCAST_EYE_HEIGHT_UNITS: 4,
  DOWNCAST_EYE_LIFT_UNITS:   2,
  SIGH_WIDTH_FACTOR:         1.03,
  SIGH_HEIGHT_FACTOR:        0.96,
  SIGH_EYE_HEIGHT_UNITS:     3,
} as const;

/** The note of a failed check: it falls with `p²` from its start to the keyboard; its places are of its top left corner. */
export const GATE_NOTE_SHAPE = {
  X_UNITS:            30,
  START_TOP_Y_UNITS:  -70,
  LANDED_TOP_Y_UNITS: -18,
  WIDTH_UNITS:        10,
  HEIGHT_UNITS:       12,
  STROKE_UNITS:       1.2,
} as const;
