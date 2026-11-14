/** Implements `02-animations.md`, "Gestures", "Point": one triangle points forward and swings; Flint can walk and jump while it points. */
import { BODY_SHAPE, EYE_SHAPE }  from '../constants/BodyShape.ts';
import { HAND_SHAPE }             from '../constants/HandShape.ts';
import { POINT_GESTURE_VALUES }   from '../constants/PointGestureValues.ts';
import type { GestureDefinition } from './GestureDefinition.ts';

export const POINT_GESTURE = Object.freeze<GestureDefinition>({
  name:                    'point',
  moods:                   ['normal'],
  durationMilliseconds:    null,
  continuesWhileWalking:   true,
  continuesWhileJumping:   true,
  stillMomentMilliseconds: 0,
  verdict:                 null,
  targetPose:              (input) => ({
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS },
    nearHand: {
      cornerCount: HAND_SHAPE.POINTING_CORNER_COUNT,
      centreX:     POINT_GESTURE_VALUES.HAND_CENTRE_X_UNITS
        + (POINT_GESTURE_VALUES.HAND_SWING_UNITS * Math.sin(input.elapsedMilliseconds / POINT_GESTURE_VALUES.HAND_SWING_DIVISOR_MILLISECONDS)),
      centreY:     POINT_GESTURE_VALUES.HAND_CENTRE_Y_UNITS,
      radius:      POINT_GESTURE_VALUES.HAND_RADIUS_UNITS,
      turnDegrees: POINT_GESTURE_VALUES.HAND_TURN_DEGREES,
      placement:   'eased',
    },
    farHand: null,
  }),
});
