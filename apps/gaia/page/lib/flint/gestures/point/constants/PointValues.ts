import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** Point: Flint leans into its work and looks ahead while its hand points; the hand is the shared pointing hand. */
import { BODY_SHAPE, EYE_SHAPE } from '../../../constants/BodyShape.ts';

export const POINT_GESTURE_VALUES = {
  LEAN_DEGREES:    BODY_SHAPE.WORKING_LEAN_DEGREES,
  EYE_SHIFT_UNITS: EYE_SHAPE.SHIFT_AT_WORK_UNITS,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const POINT_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      40,
  aboveFloorUnits: 59,
  belowFloorUnits: -3,
};
