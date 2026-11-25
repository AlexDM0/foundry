/** Point: one triangle points forward and swings; Flint can walk and jump while it points. */
import type { PosePart }                      from '../../SpritePose.ts';
import { gestureDefinition, singleFormOf }    from '../GestureDefinition.ts';
import type { GestureInput }                  from '../GestureDefinition.ts';
import { pointingHandAt }                     from '../PointingHand.ts';
import { POINT_EXTENT, POINT_GESTURE_VALUES } from './constants/PointValues.ts';

function pointPartOf(input: GestureInput): PosePart {
  return {
    body:     { leanDegrees: POINT_GESTURE_VALUES.LEAN_DEGREES },
    eyes:     { shift: POINT_GESTURE_VALUES.EYE_SHIFT_UNITS },
    nearHand: pointingHandAt(input.elapsedMilliseconds),
    farHand:  null,
  };
}

export const POINT_GESTURE = gestureDefinition({
  name:                  'point',
  intents:               { point: singleFormOf(null, 0, POINT_EXTENT) },
  continuesWhileWalking: true,
  continuesWhileJumping: true,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            pointPartOf,
});
