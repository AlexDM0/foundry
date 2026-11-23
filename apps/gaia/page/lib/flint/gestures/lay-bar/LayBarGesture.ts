/**
 * Lay the bar: while the host walks Flint along a row, a bar grows behind it and one square behind
 * Flint presses it down at a steady beat; once a cycle Flint looks back at it. It goes on while Flint walks, and stops when Flint jumps. The
 * press is short, so the hand is placed exactly and only its radius eases. The square is the far hand, over the head of the bar.
 */
import type { PosePart }                   from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                      from '../../constants/HandShape.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import {
  LAY_BAR_EYES,
  LAY_BAR_HAND,
  LAY_BAR_SHAPE,
  LAY_BAR_TIMELINE
} from './constants/LayBarValues.ts';

const { progressBetween, timeInCycleOf } = GestureTimelineUtil;

function pressDepthAt(elapsedMilliseconds: number): number {
  const timeInPress = timeInCycleOf(elapsedMilliseconds, LAY_BAR_HAND.PRESS_INTERVAL_MILLISECONDS);
  if (timeInPress >= LAY_BAR_HAND.PRESS_MILLISECONDS) return 0;
  return LAY_BAR_HAND.PRESS_DEPTH_UNITS * Math.sin((Math.PI * timeInPress) / LAY_BAR_HAND.PRESS_MILLISECONDS);
}

function layBarPartOf(input: GestureInput): PosePart {
  const timeInCycle = timeInCycleOf(input.elapsedMilliseconds, LAY_BAR_TIMELINE.CYCLE_MILLISECONDS);
  const progress = timeInCycle / LAY_BAR_TIMELINE.CYCLE_MILLISECONDS;
  const fadeOutStarts = LAY_BAR_TIMELINE.CYCLE_MILLISECONDS - LAY_BAR_TIMELINE.FADE_OUT_MILLISECONDS;
  const lookBack = progressBetween(
    timeInCycle, LAY_BAR_TIMELINE.LOOK_BACK_STARTS_MILLISECONDS, LAY_BAR_TIMELINE.LOOK_BACK_STARTS_MILLISECONDS + LAY_BAR_TIMELINE.LOOK_BACK_MILLISECONDS,
  );
  const isLookingBack = lookBack > 0 && lookBack < 1;
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     { height: LAY_BAR_EYES.HEIGHT_UNITS, shift: isLookingBack ? LAY_BAR_EYES.LOOK_BACK_SHIFT_UNITS : EYE_SHAPE.SHIFT_AT_WORK_UNITS },
    nearHand: null,
    farHand:  {
      cornerCount: HAND_SHAPE.TYPING_CORNER_COUNT,
      centreX:     LAY_BAR_HAND.CENTRE_X_UNITS,
      centreY:     LAY_BAR_HAND.CENTRE_Y_UNITS + pressDepthAt(input.elapsedMilliseconds),
      radius:      LAY_BAR_HAND.RADIUS_UNITS,
      turnDegrees: LAY_BAR_HAND.TURN_DEGREES,
      placement:   'exact-position',
    },
    props: {
      layBar: {
        shown:      1,
        barLength:  LAY_BAR_SHAPE.BAR_MINIMUM_LENGTH_UNITS + (LAY_BAR_SHAPE.BAR_GROWTH_UNITS * progress * progress),
        barOpacity: 1 - progressBetween(timeInCycle, fadeOutStarts, LAY_BAR_TIMELINE.CYCLE_MILLISECONDS),
      },
    },
  };
}

export const LAY_BAR_GESTURE = gestureDefinition({
  name:                  'lay-bar',
  intents:               { 'lay-bar': singleFormOf(null, LAY_BAR_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: true,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            layBarPartOf,
});
