import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** Held: Flint clamps a ready ticket and holds up a flat palm; sprite units, for Flint facing right. */
export const HOLD_TIMELINE = {
  /** The ticket fades in and the clamp slides down until the fastening starts. */
  FASTEN_STARTS_MILLISECONDS: 500,
  PALM_STARTS_MILLISECONDS:   1100,
  /** Reduced motion holds the clamped ticket and the palm. */
  STILL_MOMENT_MILLISECONDS:  2000,
} as const;

/** The palm moves up and down by `PALM_SWAY_UNITS × sin(t / PALM_SWAY_DIVISOR_MILLISECONDS)`. */
export const HOLD_POSE = {
  FASTEN_EYE_HEIGHT_UNITS:        5,
  FASTENER_CENTRE_X_UNITS:        38,
  FASTENER_CENTRE_Y_UNITS:        -52,
  FASTENER_RADIUS_UNITS:          6,
  FASTENER_TURN_DEGREES:          120,
  PALM_CENTRE_X_UNITS:            26,
  PALM_CENTRE_Y_UNITS:            -34,
  PALM_RADIUS_UNITS:              7,
  PALM_TURN_DEGREES:              0,
  PALM_SWAY_UNITS:                1,
  PALM_SWAY_DIVISOR_MILLISECONDS: 500,
  PALM_LEAN_DEGREES:              0,
  PALM_EYE_HEIGHT_UNITS:          6,
  PALM_EYE_SHIFT_UNITS:           2,
} as const;

/** The ticket at 80% around the paper's centre, and the clamp over its top edge, which slides down to its place. */
export const HELD_TICKET_SHAPE = {
  TICKET_SCALE:      0.8,
  CLAMP_PATH:        'M33 -49 H43 V-39 H40 V-46 H36 V-39 H33Z',
  CLAMP_SLIDE_UNITS: 8,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const HOLD_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      46.5,
  aboveFloorUnits: 64.5,
  belowFloorUnits: -3,
};
