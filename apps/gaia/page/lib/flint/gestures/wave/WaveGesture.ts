/**
 * Wave, with its "Hi!" mark, and the wave of a peek around a corner: in the
 * sideways pose the hand keeps its distance ahead of the body on the screen, and the eye shift of the pop-in stays.
 */
import type { PosePart }                   from '../../SpritePose.ts';
import { emoteMarkAtRest }                 from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                      from '../../constants/HandShape.ts';
import { SPRING }                          from '../../constants/Motion.ts';
import { AnimationCurveUtil }              from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { WAVE_GESTURE_VALUES }             from './constants/WaveValues.ts';

function wavePartOf(input: GestureInput): PosePart {
  const rock = Math.sin(input.elapsedMilliseconds / WAVE_GESTURE_VALUES.ROCK_DIVISOR_MILLISECONDS);
  const isPeeking = input.sidewaysWidth < 1;
  const handRestX = isPeeking ? WAVE_GESTURE_VALUES.PEEK_HAND_DISTANCE_UNITS / input.sidewaysWidth : WAVE_GESTURE_VALUES.HAND_CENTRE_X_UNITS;
  const greetingScale = AnimationCurveUtil.springScaleAt(input.elapsedMilliseconds / SPRING.DURATION_MILLISECONDS);
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     isPeeking ? { height: WAVE_GESTURE_VALUES.EYE_HEIGHT_UNITS } : { height: WAVE_GESTURE_VALUES.EYE_HEIGHT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS },
    nearHand: {
      cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT,
      centreX:     handRestX + (WAVE_GESTURE_VALUES.ROCK_SWING_UNITS * rock),
      centreY:     WAVE_GESTURE_VALUES.HAND_CENTRE_Y_UNITS - Math.abs(rock),
      radius:      WAVE_GESTURE_VALUES.HAND_RADIUS_UNITS,
      turnDegrees: WAVE_GESTURE_VALUES.ROCK_TURN_DEGREES * rock,
      placement:   'eased',
    },
    farHand:   null,
    emoteMark: { ...emoteMarkAtRest('greeting'), innerScaleX: greetingScale, innerScaleY: greetingScale },
  };
}

export const WAVE_GESTURE = gestureDefinition({
  name:                  'wave',
  // Under reduced motion the hand stands upright, at a rock of 0, and the mark is fully grown.
  intents:               { wave: singleFormOf(WAVE_GESTURE_VALUES.DURATION_MILLISECONDS, Math.PI * WAVE_GESTURE_VALUES.ROCK_DIVISOR_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            wavePartOf,
});
