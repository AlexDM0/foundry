/**
 * Crash resume: Flint flickers out, lies as an outline around one spark, and comes back,
 * in one action; in sprite units, for Flint facing right, and milliseconds; `sin(t / n)` names `n` a divisor.
 */
export const CRASH_RESUME = {
  DURATION_MILLISECONDS:     2800,
  STILL_MOMENT_MILLISECONDS: 900,
} as const;

/** 0 to 120: the shock, eyes wide, set at once. */
export const SHOCK = {
  ENDS_MILLISECONDS: 120,
  EYE_HEIGHT_UNITS:  10,
} as const;

/** The fill opacity of each moment is set at once and held until the next; from the last moment the body is an outline. */
export const FLICKER = {
  MOMENTS_MILLISECONDS: [120, 220, 320, 420],
  FILL_OPACITIES:       [1, 0.3, 0.9, 0],
  OUT_EYE_HEIGHT_UNITS: 1,
} as const;

/** 420 to 1300: Flint lies landed and leaned back; the hover and the lean ease there at the body rate. */
export const SLUMP = {
  STARTS_MILLISECONDS: 420,
  ENDS_MILLISECONDS:   1300,
  HOVER_UNITS:         0,
  LEAN_DEGREES:        -7,
} as const;

/** One spark at the body centre while only the outline shows; its scale is 1 + PULSE_SCALE × sin(t / PULSE_DIVISOR_MILLISECONDS). */
export const CORE_SPARK = {
  CENTRE_X_UNITS:             0,
  CENTRE_Y_UNITS:             -24,
  SHOWS_MILLISECONDS:         600,
  FADES_MILLISECONDS:         1300,
  GONE_MILLISECONDS:          1600,
  PULSE_SCALE:                0.3,
  PULSE_DIVISOR_MILLISECONDS: 80,
} as const;

/** 1300 on: the fill comes back in a straight line, and the bright tint goes out. */
export const RESTORE = {
  STARTS_MILLISECONDS:   1300,
  FILLED_MILLISECONDS:   1600,
  TINT_AMOUNT:           0.6,
  TINT_OUT_MILLISECONDS: 2000,
} as const;

/** 1700 to 2200: the shake is SHAKE_UNITS × (1 - p) × sin(t / SHAKE_DIVISOR_MILLISECONDS); the eyes close twice. */
export const HEAD_SHAKE = {
  STARTS_MILLISECONDS:        1700,
  ENDS_MILLISECONDS:          2200,
  SHAKE_UNITS:                2,
  SHAKE_DIVISOR_MILLISECONDS: 45,
  BLINKS_MILLISECONDS:        [
    { STARTS: 1750, ENDS: 1830 },
    { STARTS: 1950, ENDS: 2030 },
  ],
  CLOSED_EYE_HEIGHT_UNITS: 1,
} as const;

/** 2200 to 2800: Flint looks behind, then ahead. */
export const LOOK_AROUND = {
  STARTS_MILLISECONDS:    2200,
  AHEAD_MILLISECONDS:     2500,
  BEHIND_EYE_SHIFT_UNITS: -3,
  AHEAD_EYE_SHIFT_UNITS:  6,
} as const;
