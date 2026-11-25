import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** Sandbox: Flint types under a dome, reaches out, meets the dome and sweats; in sprite units, facing right. */
import { EYE_SHAPE }              from '../../../constants/BodyShape.ts';
import { NORMAL_TYPING }          from '../../constants/TypingHands.ts';
import { NORMAL_WORKING_VARIANT } from '../../constants/WorkingVariantValues.ts';

export const SANDBOX_TIMELINE = {
  CYCLE_MILLISECONDS:        4000,
  REACH_STARTS_MILLISECONDS: 1800,
  CONTACT_MILLISECONDS:      2150,
  RECOIL_ENDS_MILLISECONDS:  2400,
  SWEAT_ENDS_MILLISECONDS:   3600,
  DOME_FLASH_MILLISECONDS:   400,
  RIPPLES_FADE_MILLISECONDS: 300,
  STILL_MOMENT_MILLISECONDS: 2150,
} as const;

/** Typing in the normal variant, as every gesture that types. */
export const SANDBOX_TYPING = {
  LEAN_DEGREES:     NORMAL_WORKING_VARIANT.LEAN_DEGREES,
  EYE_HEIGHT_UNITS: NORMAL_WORKING_VARIANT.EYE_HEIGHT_UNITS,
  EYE_LIFT_UNITS:   NORMAL_TYPING.EYE_LIFT_UNITS,
  EYE_SHIFT_UNITS:  EYE_SHAPE.SHIFT_AT_WORK_UNITS,
} as const;

/**
 * The near hand reaches out level with its aim at (46, -34), from just outside the body, and is stopped where its edge meets the dome; it
 * is placed exactly, so the stop is on the frame of the contact. Then it springs back with a wobble of
 * `WOBBLE_DEGREES × sin(WOBBLE_HALF_TURNS × π × p)`.
 */
export const SANDBOX_REACH = {
  HAND_CORNER_COUNT: 5,
  HAND_RADIUS_UNITS: 5,
  START_X_UNITS:     16,
  CONTACT_X_UNITS:   29,
  REACH_Y_UNITS:     -34,
  RECOIL_X_UNITS:    28,
  RECOIL_Y_UNITS:    -30,
  WOBBLE_DEGREES:    20,
  WOBBLE_HALF_TURNS: 3,
} as const;

/** While the sweat drop shows, the eyes look away as in the Sweatdrop emote. */
export const SANDBOX_SWEAT = {
  EYE_HEIGHT_UNITS: 6,
  EYE_SHIFT_UNITS:  -1,
} as const;

/**
 * The dome, in front of all other parts, and the two short ripples at the point where the hand's edge meets it. The design draws the
 * ripples in light water `#e4f2f5`, 1 wide; they are drawn in water, 1.5 wide, a builder decision for the owner to confirm, since light
 * water on a light ground cannot be read at 0.5 pixels for one unit.
 */
export const DOME_SHAPE = {
  PATH:                      'M-34 6 A38 64 0 0 1 42 6',
  FILL_OPACITY:              0.08,
  STROKE_UNITS:              1,
  RESTING_OPACITY:           0.5,
  CONTACT_X_UNITS:           34,
  CONTACT_Y_UNITS:           -34,
  RIPPLE_RADII_UNITS:        [2.5, 5],
  RIPPLE_HALF_ANGLE_DEGREES: 50,
  RIPPLE_STROKE_UNITS:       1.5,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const SANDBOX_EXTENT: DrawnExtent = {
  backUnits:       34.5,
  frontUnits:      45,
  aboveFloorUnits: 67.5,
  belowFloorUnits: 3.5,
};
