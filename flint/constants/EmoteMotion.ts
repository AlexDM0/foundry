/**
 * The moves of the emotes of `02-animations.md`, "Emotes", checked against `reference/playground.html`; `sin(age / n)` names `n` as a
 * divisor in milliseconds. The marks' shapes and places are in `flint/constants/EmoteMarkShapes.ts`.
 */

/** In its last moment, an emote's mark fades out and shrinks to this share of its scale. */
export const MARK_EXIT = {
  FADE_MILLISECONDS:     160,
  SMALLEST_SCALE_FACTOR: 0.6,
} as const;

/** The pulse of the anger vein, which the Annoyed emote and the angry moods share. */
export const ANGER_VEIN_PULSE = {
  FACTOR:               0.1,
  DIVISOR_MILLISECONDS: 95,
} as const;

/** The one hop of the Surprised and Idea emotes: `HEIGHT_UNITS × sin(π × age / MILLISECONDS)` while age is below `MILLISECONDS`. */
export const EMOTE_HOP = {
  HEIGHT_UNITS: 6,
  MILLISECONDS: 300,
} as const;

export const ANNOYED_MOTION = {
  EYE_HEIGHT_UNITS:           7,
  SLANT_DEGREES:              20,
  SHAKE_UNITS:                1.5,
  SHAKE_DIVISOR_MILLISECONDS: 30,
  SHAKE_MILLISECONDS:         1100,
} as const;

export const SWEATDROP_MOTION = {
  EYE_HEIGHT_UNITS:    6,
  EYE_SHIFT_UNITS:     -1,
  FALL_UNITS:          9,
  FALL_MILLISECONDS:   1300,
  START_SCALE_FACTOR:  0.6,
  GROWTH_MILLISECONDS: 100,
} as const;

export const SURPRISED_MOTION = { EYE_HEIGHT_UNITS: 10, } as const;

export const DOUBT_MOTION = {
  RIGHT_EYE_HEIGHT_UNITS: 5,
  ADDED_LEAN_DEGREES:     7,
} as const;

export const THINKING_MOTION = {
  EYE_LIFT_UNITS:            -3,
  EYE_SHIFT_UNITS:           4,
  FIRST_DOT_MILLISECONDS:    150,
  DOT_INTERVAL_MILLISECONDS: 500,
} as const;

export const IDEA_MOTION = {
  EYE_HEIGHT_UNITS:                  10,
  RAYS_START_MILLISECONDS:           260,
  RAYS_OPACITY:                      0.35,
  RAYS_FLICKER_OPACITY:              0.2,
  RAYS_FLICKER_DIVISOR_MILLISECONDS: 130,
} as const;

/** Two bounces: `HEIGHT_UNITS × |sin(π × age / HALF_PERIOD_MILLISECONDS)|` while age is below `MILLISECONDS`. */
export const HAPPY_MOTION = {
  BOUNCE_HEIGHT_UNITS:             4,
  BOUNCE_HALF_PERIOD_MILLISECONDS: 300,
  BOUNCE_MILLISECONDS:             600,
} as const;

export const NERVOUS_MOTION = {
  EYE_HEIGHT_UNITS:           5,
  /** The eye shift darts between these values, a new one each `EYE_DART_MILLISECONDS`. */
  EYE_SHIFTS_UNITS:           [5, -1],
  EYE_DART_MILLISECONDS:      170,
  SHAKE_UNITS:                1.1,
  SHAKE_DIVISOR_MILLISECONDS: 22,
} as const;

/** Bead k starts `START_INTERVAL_MILLISECONDS × k` after the emote; `f` goes from 0 to 1 in each cycle of a bead. */
export const SWEAT_BEAD_FLIGHT = {
  SIDES:                       [-1, 1, -0.4],
  START_INTERVAL_MILLISECONDS: 230,
  CYCLE_MILLISECONDS:          690,
  START_X_UNITS:               6,
  SPREAD_X_UNITS:              11,
  START_Y_UNITS:               -2,
  RISE_UNITS:                  11,
  FALL_UNITS:                  9,
  TURN_DEGREES:                40,
  /** Under reduced motion the beads hold still at this point of their flight. */
  STILL_FLIGHT:                0.3,
} as const;
