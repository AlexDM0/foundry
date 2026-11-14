/** The moods of typing and reviewing in `02-animations.md`, "Type" and "Review": the body and eyes the two gestures share per mood. */
import { BODY_SHAPE, EYE_SHAPE } from './BodyShape.ts';

export const NORMAL_WORK_MOOD = {
  LEAN_DEGREES:     BODY_SHAPE.WORKING_LEAN_DEGREES,
  EYE_HEIGHT_UNITS: 6,
} as const;

/** The body moves up and down by `BOB_UNITS × sin(t / BOB_DIVISOR_MILLISECONDS)`. */
export const BUSY_WORK_MOOD = {
  LEAN_DEGREES:             9,
  EYE_HEIGHT_UNITS:         4,
  BOB_UNITS:                0.8,
  BOB_DIVISOR_MILLISECONDS: 50,
} as const;

/** The body shakes sideways by `SHAKE_UNITS × sin(t / SHAKE_DIVISOR_MILLISECONDS)`; the vein's scale pulses by the pulse factor. */
export const ANGRY_WORK_MOOD = {
  LEAN_DEGREES:                    7,
  EYE_HEIGHT_UNITS:                7,
  EYE_SLANT_DEGREES:               EYE_SHAPE.GLARE_SLANT_DEGREES,
  SHAKE_UNITS:                     0.8,
  SHAKE_DIVISOR_MILLISECONDS:      28,
  VEIN_PULSE_FACTOR:               0.1,
  VEIN_PULSE_DIVISOR_MILLISECONDS: 95,
} as const;
