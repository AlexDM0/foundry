import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** Bouncer: a loop at a roped post, refused or admitted; in sprite units, for Flint facing right. */
export const BOUNCER_TIMELINE = {
  CYCLE_MILLISECONDS:            2400,
  SHAKE_STARTS_MILLISECONDS:     600,
  SHAKE_ENDS_MILLISECONDS:       1400,
  CROSS_SHOWS_MILLISECONDS:      600,
  CROSS_HIDES_MILLISECONDS:      1600,
  UNHOOK_ENDS_MILLISECONDS:      600,
  WELCOME_STARTS_MILLISECONDS:   600,
  HAPPY_EYES_START_MILLISECONDS: 900,
  HAPPY_EYES_END_MILLISECONDS:   1500,
  /** The props fade from here to the end of the cycle of an admit. */
  FADE_STARTS_MILLISECONDS:      1800,
  /** The design gives no return of the props an admit faded: they fade in again as the blank ticket of Make a ticket does. */
  RETURN_MILLISECONDS:           300,
  STILL_MOMENT_MILLISECONDS:     1000,
} as const;

/** The one hexagon that holds the rope, and the body and eyes of each variant. */
export const BOUNCER_POSE = {
  HAND_CORNER_COUNT:          6,
  HAND_RADIUS_UNITS:          7,
  HAND_CENTRE_X_UNITS:        26,
  HAND_CENTRE_Y_UNITS:        -26,
  REFUSE_LEAN_DEGREES:        0,
  REFUSE_WIDTH_FACTOR:        1.04,
  REFUSE_EYE_HEIGHT_UNITS:    6,
  REFUSE_EYE_SLANT_DEGREES:   8,
  REFUSE_EYE_SHIFT_UNITS:     2,
  /** The head shake is `SHAKE_UNITS × sin(t / SHAKE_DIVISOR_MILLISECONDS)`. */
  SHAKE_UNITS:                2,
  SHAKE_DIVISOR_MILLISECONDS: 90,
  ADMIT_LEAN_DEGREES:         -4,
  ADMIT_EYE_SHIFT_UNITS:      6,
} as const;

/**
 * The post, its rope and the verdicts. The rope is `M start Q control end`; it runs from the hand to the knob of the post while hooked, and
 * hangs from the hand once unhooked. The cross is placed by its centre, so that it stands above the post.
 */
export const BARRIER_SHAPE = {
  POST_X_UNITS:             46,
  POST_BOTTOM_Y_UNITS:      -8,
  POST_TOP_Y_UNITS:         -30,
  POST_STROKE_UNITS:        2,
  KNOB_RADIUS_UNITS:        2,
  ROPE_STROKE_UNITS:        1.6,
  ROPE_START_X_UNITS:       26,
  ROPE_START_Y_UNITS:       -26,
  HOOKED_CONTROL_X_UNITS:   36,
  HOOKED_CONTROL_Y_UNITS:   -18,
  HOOKED_END_X_UNITS:       46,
  HOOKED_END_Y_UNITS:       -30,
  UNHOOKED_CONTROL_X_UNITS: 28,
  UNHOOKED_CONTROL_Y_UNITS: -14,
  UNHOOKED_END_X_UNITS:     30,
  UNHOOKED_END_Y_UNITS:     -8,
  CROSS_CENTRE_X_UNITS:     46,
  CROSS_CENTRE_Y_UNITS:     -40,
  CROSS_SCALE:              0.7,
  TICK_START_X_UNITS:       42,
  TICK_START_Y_UNITS:       -44,
} as const;

/** All that each form of the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const BOUNCER_EXTENTS = {
  REFUSE: {
    backUnits:       23,
    frontUnits:      51.5,
    aboveFloorUnits: 59,
    belowFloorUnits: -3,
  },
  ADMIT: {
    backUnits:       22,
    frontUnits:      52.5,
    aboveFloorUnits: 59,
    belowFloorUnits: -3,
  },
} as const satisfies Readonly<Record<string, DrawnExtent>>;
