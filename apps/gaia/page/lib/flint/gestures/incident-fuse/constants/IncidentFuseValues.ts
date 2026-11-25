import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/**
 * Incident fuse: an incident's default move when nobody settles it. A fuse burns down to the envelope, the
 * flame goes out, and Flint stamps the envelope. In sprite units, for Flint facing right; the envelope is placed by its top left corner.
 */
export const INCIDENT_FUSE_TIMELINE = {
  CYCLE_MILLISECONDS:         7600,
  /** The props fade in at the start of each cycle, so they never show at once after the fade out. */
  FADE_IN_MILLISECONDS:       300,
  BURN_ENDS_MILLISECONDS:     6000,
  /** Flint looks at the user every `LOOK_INTERVAL_MILLISECONDS`, for `LOOK_MILLISECONDS`, while the fuse burns. */
  LOOK_INTERVAL_MILLISECONDS: 2000,
  LOOK_MILLISECONDS:          400,
  /** Flint is nervous once this much of the fuse has burned. */
  NERVOUS_FROM_BURN:          0.7,
  SMOKE_MILLISECONDS:         300,
  /** The stamp of Make a ticket, from the flame going out: raised, falling, sealed with a jolt of the paper, lifted, gone. */
  STAMP_RAISED_MILLISECONDS:  6200,
  SEALED_MILLISECONDS:        6320,
  JOLT_ENDS_MILLISECONDS:     6450,
  STAMP_LIFTED_MILLISECONDS:  6600,
  STAMP_LEAVES_MILLISECONDS:  6700,
  FADE_STARTS_MILLISECONDS:   7200,
  STILL_MOMENT_MILLISECONDS:  3000,
} as const;

/** The fuse: two quadratic curves from the envelope's top right corner to its free end. */
export const FUSE_SHAPE = {
  START_X_UNITS:          44,
  START_Y_UNITS:          -22,
  FIRST_CONTROL_X_UNITS:  50,
  FIRST_CONTROL_Y_UNITS:  -26,
  FIRST_END_X_UNITS:      47,
  FIRST_END_Y_UNITS:      -32,
  SECOND_CONTROL_X_UNITS: 44,
  SECOND_CONTROL_Y_UNITS: -38,
  FREE_END_X_UNITS:       51,
  FREE_END_Y_UNITS:       -42,
  STROKE_UNITS:           1.4,
  /** Each curve is drawn and measured as this many straight steps. */
  STEPS_PER_CURVE:        16,
} as const;

/** The flame is a small spark with a light core that pulses by `PULSE × sin(t / PULSE_DIVISOR_MILLISECONDS)`; it goes out in smoke. */
export const FLAME_SHAPE = {
  SIDE_UNITS:                 3,
  CORE_SIDE_UNITS:            1.5,
  TURN_DEGREES:               45,
  PULSE:                      0.2,
  PULSE_DIVISOR_MILLISECONDS: 40,
  SMOKE_SIDE_UNITS:           2,
  SMOKE_DRIFT_UNITS:          6,
  /** Each puff drifts at its angle, 0 forward and negative up. */
  SMOKE_ANGLES_DEGREES:       [-135, -90, -45],
  SMOKE_TURN_DEGREES:         45,
} as const;

export const INCIDENT_ENVELOPE = {
  X_UNITS: 30,
  Y_UNITS: -22,
} as const;

/** The stamp of Make a ticket, on the envelope's own seal: a square that rises above the seal, falls onto it and lifts away. */
export const INCIDENT_STAMP = {
  SEAL_CENTRE_X_UNITS: 37,
  SEAL_CENTRE_Y_UNITS: -17,
  RAISED_Y_UNITS:      -54,
  JOLT_UNITS:          1.5,
  SEAL_SIDE_UNITS:     4,
  SEAL_TURN_DEGREES:   45,
} as const;

export const INCIDENT_EYES = {
  WATCHING_HEIGHT_UNITS:       6,
  WATCHING_SHIFT_UNITS:        6,
  WATCHING_FIRST_LIFT_UNITS:   -3,
  LOOKING_AT_USER_SHIFT_UNITS: 1,
  /** While nervous the eye shift darts between these values, a new one each `NERVOUS_DART_MILLISECONDS`. */
  NERVOUS_SHIFTS_UNITS:        [5, 7],
  NERVOUS_DART_MILLISECONDS:   170,
  STAMPING_HEIGHT_UNITS:       6,
  STAMPING_SHIFT_UNITS:        6,
} as const;

/** While nervous the body shivers by `NERVOUS_SHAKE_UNITS × sin(t / NERVOUS_SHAKE_DIVISOR_MILLISECONDS)`. */
export const INCIDENT_BODY = {
  NERVOUS_SHAKE_UNITS:                0.6,
  NERVOUS_SHAKE_DIVISOR_MILLISECONDS: 22,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const INCIDENT_FUSE_EXTENT: DrawnExtent = {
  backUnits:       27.5,
  frontUnits:      53.5,
  aboveFloorUnits: 69,
  belowFloorUnits: -3,
};
