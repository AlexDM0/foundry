/** Implements `02-animations.md`, "Gestures", "Fasten": a bolt slides in and one hexagon turns it in steps. */
import { BODY_SHAPE, EYE_SHAPE }  from '../constants/BodyShape.ts';
import { FASTEN_GESTURE_VALUES }  from '../constants/FastenGestureValues.ts';
import { HAND_SHAPE }             from '../constants/HandShape.ts';
import { AnimationCurveUtil }     from '../utils/AnimationCurveUtil.ts';
import type { GestureDefinition } from './GestureDefinition.ts';

/** A hexagon looks the same after each turn of 60 degrees, so the turn of one cycle is the whole turn the hand shows. */
function handTurnDegreesAt(elapsedMilliseconds: number): number {
  const cycleProgress = AnimationCurveUtil.cycleProgressOf(elapsedMilliseconds, FASTEN_GESTURE_VALUES.CYCLE_MILLISECONDS);
  const turnProgress = AnimationCurveUtil.clamp((cycleProgress - FASTEN_GESTURE_VALUES.WAIT_FRACTION) / FASTEN_GESTURE_VALUES.TURN_FRACTION);
  return turnProgress * FASTEN_GESTURE_VALUES.TURN_PER_CYCLE_DEGREES;
}

export const FASTEN_GESTURE = Object.freeze<GestureDefinition>({
  name:                    'fasten',
  moods:                   ['normal'],
  durationMilliseconds:    null,
  continuesWhileWalking:   false,
  continuesWhileJumping:   false,
  stillMomentMilliseconds: 0,
  verdict:                 null,
  targetPose:              (input) => ({
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: FASTEN_GESTURE_VALUES.EYE_HEIGHT_UNITS },
    nearHand: {
      cornerCount: HAND_SHAPE.FASTENING_CORNER_COUNT,
      centreX:     FASTEN_GESTURE_VALUES.HAND_CENTRE_X_UNITS,
      centreY:     FASTEN_GESTURE_VALUES.HAND_CENTRE_Y_UNITS,
      radius:      FASTEN_GESTURE_VALUES.HAND_RADIUS_UNITS,
      turnDegrees: handTurnDegreesAt(input.elapsedMilliseconds),
      placement:   'eased',
    },
    farHand: null,
    props:   { bolt: { shown: 1 } },
  }),
});
