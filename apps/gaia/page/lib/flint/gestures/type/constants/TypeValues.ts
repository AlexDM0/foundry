import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** The busy and angry variants of Type; the hands and normal typing are `flint/gestures/constants/TypingHands.ts`. */

/** The eye shift takes the next value of the list every `EYE_SHIFT_STEP_MILLISECONDS`. */
export const BUSY_TYPING = {
  TAP_DEPTH_UNITS:             3,
  TAP_DIVISOR_MILLISECONDS:    26,
  EYE_LIFT_UNITS:              3,
  EYE_SHIFTS_UNITS:            [6, 8, 5],
  EYE_SHIFT_STEP_MILLISECONDS: 300,
} as const;

export const ANGRY_TYPING = { EYE_LIFT_UNITS: 2, } as const;

/** The slam of angry typing: raised for the first share of the cycle, a straight fall, then on the key until the cycle ends. */
export const TYPING_SLAM = {
  CYCLE_MILLISECONDS:      360,
  RAISED_UNITS:            -9,
  FALL_START_FRACTION:     0.6,
  FALL_END_FRACTION:       0.82,
  FAR_HAND_DELAY_FRACTION: 0.5,
} as const;

/** The keyboard moves down in the last share of each jolt cycle of angry typing. */
export const KEYBOARD_JOLT = {
  CYCLE_MILLISECONDS: 180,
  START_FRACTION:     0.82,
  DROP_UNITS:         1.6,
} as const;

/** All that each form of the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const TYPE_EXTENTS = {
  TYPE: {
    backUnits:       20,
    frontUnits:      45,
    aboveFloorUnits: 59,
    belowFloorUnits: -1,
  },
  TYPE_BUSY: {
    backUnits:       20,
    frontUnits:      45,
    aboveFloorUnits: 59,
    belowFloorUnits: -1,
  },
  TYPE_ANGRY: {
    backUnits:       20,
    frontUnits:      46,
    aboveFloorUnits: 69.5,
    belowFloorUnits: -0.5,
  },
} as const satisfies Readonly<Record<string, DrawnExtent>>;
