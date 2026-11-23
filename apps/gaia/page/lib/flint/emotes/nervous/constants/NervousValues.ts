/** The Nervous emote: how long it shows, and its moves; `sin(age / n)` names `n` a divisor. */
export const NERVOUS_MOTION = {
  DURATION_MILLISECONDS:      2100,
  EYE_HEIGHT_UNITS:           5,
  /** The eye shift darts between these values, a new one each `EYE_DART_MILLISECONDS`. */
  EYE_SHIFTS_UNITS:           [5, -1],
  EYE_DART_MILLISECONDS:      170,
  SHAKE_UNITS:                1.1,
  SHAKE_DIVISOR_MILLISECONDS: 22,
} as const;
