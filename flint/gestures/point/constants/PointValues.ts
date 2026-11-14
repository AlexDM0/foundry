/** Point of `02-animations.md`: Flint leans into its work and looks ahead while its hand points; the hand is the shared pointing hand. */
import { BODY_SHAPE, EYE_SHAPE } from '../../../constants/BodyShape.ts';

export const POINT_GESTURE_VALUES = {
  LEAN_DEGREES:    BODY_SHAPE.WORKING_LEAN_DEGREES,
  EYE_SHIFT_UNITS: EYE_SHAPE.SHIFT_AT_WORK_UNITS,
} as const;
