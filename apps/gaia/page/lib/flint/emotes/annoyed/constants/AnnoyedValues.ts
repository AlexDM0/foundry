/** The Annoyed emote of `02-animations.md`, "Emotes": how long it shows, and its moves; `sin(age / n)` names `n` a divisor. */
export const ANNOYED_MOTION = {
  DURATION_MILLISECONDS:      1500,
  EYE_HEIGHT_UNITS:           7,
  SLANT_DEGREES:              20,
  SHAKE_UNITS:                1.5,
  SHAKE_DIVISOR_MILLISECONDS: 30,
  SHAKE_MILLISECONDS:         1100,
} as const;

/** The pulse of the anger vein, which the Annoyed emote and the angry moods share. */
export const ANGER_VEIN_PULSE = {
  FACTOR:               0.1,
  DIVISOR_MILLISECONDS: 95,
} as const;
