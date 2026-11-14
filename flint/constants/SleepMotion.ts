/**
 * The sleep sequence of `02-animations.md`, "Sleep", checked against `reference/playground.html`; `sin(t / n)` names `n` as a divisor in
 * milliseconds. The rates of the level are in `flint/constants/Easing.ts`, the ember shapes in `flint/constants/EmoteMarkShapes.ts`.
 */
export const SLEEP_POSE = {
  HOVER_UNITS:                 0,
  LEAN_DEGREES:                -7,
  /** The eye height follows the level: height + (CLOSED_EYE_HEIGHT_UNITS - height) × level. */
  CLOSED_EYE_HEIGHT_UNITS:     1.6,
  BREATH_DIVISOR_MILLISECONDS: 716,
  BREATH_WIDTH_FACTOR:         0.02,
  BREATH_HEIGHT_FACTOR:        0.03,
  /** Glow opacity: level × (GLOW_BASE_OPACITY + GLOW_BREATH_OPACITY × (0.5 + 0.5 × breath)). */
  GLOW_BASE_OPACITY:           0.25,
  GLOW_BREATH_OPACITY:         0.45,
} as const;

export const SLEEP_LEVELS = {
  /** The embers rise only once the level is above this. */
  EMBERS_START_LEVEL: 0.9,
  /** A wake is over, and fading embers are gone, once they are at or below this. */
  SETTLED_LEVEL:      0.01,
} as const;

/** Ember n starts `START_INTERVAL_MILLISECONDS × n` after the rise starts; `p` goes from 0 to 1 in each cycle of an ember. */
export const EMBER_RISE = {
  START_INTERVAL_MILLISECONDS: 1050,
  CYCLE_MILLISECONDS:          4200,
  BASE_X_UNITS:                4,
  STEP_X_UNITS:                2,
  DRIFT_X_UNITS:               7,
  START_Y_UNITS:               -44,
  RISE_UNITS:                  30,
  START_TURN_DEGREES:          45,
  TURN_SPREAD_DEGREES:         120,
  /** The ember fades in until `p` is this, then fades out as `1 - p`. */
  FADE_IN_PROGRESS:            0.15,
} as const;

/** The embers of sleep: squares behind Flint that never mirror; each entry is one ember, in rising order. */
export const EMBER_SHAPES = [
  { SIDE_UNITS: 5, COLOUR: 'body' },
  { SIDE_UNITS: 4, COLOUR: 'emberLight' },
  { SIDE_UNITS: 3.5, COLOUR: 'emberDark' },
  { SIDE_UNITS: 6, COLOUR: 'body' },
] as const;
