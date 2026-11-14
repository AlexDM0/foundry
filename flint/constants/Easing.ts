/** The easing rates of `02-animations.md`, "Rules for all animations": `value += (target - value) × (1 - exp(-rate × seconds))`. */
export const EASING_RATES_PER_SECOND = {
  /** Hands (position and radius), props (shown level and slide), the lens, the eye shift and the sideways width. */
  HANDS_AND_PROPS: 18,
  /** Lean, hover height and the position during a peek. */
  BODY:            7,
  /** Eye height, eye lift, eye slant and the cross-fade to the happy eyes. */
  EYES:            22,
  FALLING_ASLEEP:  2.2,
  WAKING:          7,
} as const;

/** A hand that must change its shape shrinks with this many times the easing step of a hand on each frame. */
export const HAND_SHRINK_STEP_MULTIPLIER = 2;

/** A frame after a long pause (a hidden tab, a debugger) moves the pose no further than one frame of this length. */
export const MAXIMUM_FRAME_STEP_MILLISECONDS = 33;

export const MILLISECONDS_PER_SECOND = 1000;

/** An attendant member the host took away is gone once the easing has shrunk it below this scale. */
export const VANISHED_ATTENDANT_SCALE = 0.02;
