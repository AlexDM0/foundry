/**
 * Needs an answer: a loop in which Flint holds up a card with "?". In `ask` one pentagon holds it,
 * the two bob and the card sways around the hand, and Flint looks at it each 3 seconds. In `ask-knock` Flint faces the user, holds a
 * smaller, lower card in the far hand and knocks twice in each cycle with a square knuckle, with two arcs that fade after each knock.
 */
import type { PosePart }                          from '../../SpritePose.ts';
import { HAND_SHAPE }                             from '../../constants/HandShape.ts';
import type { GestureInput }                      from '../GestureDefinition.ts';
import { gestureDefinition }                      from '../GestureDefinition.ts';
import { GestureTimelineUtil }                    from '../GestureTimelineUtil.ts';
import { ASK_KNOCK_POSE, ASK_POSE, ASK_TIMELINE } from './constants/AskValues.ts';

type AskVariant = 'normal' | 'knock';

function askPartOf(elapsedMilliseconds: number): PosePart {
  const isLookingAtTheCard = GestureTimelineUtil.timeInCycleOf(elapsedMilliseconds, ASK_TIMELINE.LOOK_PERIOD_MILLISECONDS)
    >= ASK_TIMELINE.LOOK_PERIOD_MILLISECONDS - ASK_TIMELINE.LOOK_MILLISECONDS;
  return {
    body:     { leanDegrees: ASK_POSE.LEAN_DEGREES },
    eyes:     { height: ASK_POSE.EYE_HEIGHT_UNITS, shift: isLookingAtTheCard ? ASK_POSE.LOOK_EYE_SHIFT_UNITS : ASK_POSE.EYE_SHIFT_UNITS },
    nearHand: {
      cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT, centreX: 0, centreY: 0, radius: ASK_POSE.HAND_RADIUS_UNITS, turnDegrees: 0, placement: { heldTo: 'askCard' },
    },
    farHand: null,
    props:   {
      askCard: {
        shown:       1,
        scale:       1,
        offsetY:     ASK_POSE.BOB_UNITS * Math.sin(elapsedMilliseconds / ASK_POSE.BOB_DIVISOR_MILLISECONDS),
        turnDegrees: ASK_POSE.TURN_DEGREES * Math.sin(elapsedMilliseconds / ASK_POSE.TURN_DIVISOR_MILLISECONDS),
      },
    },
  };
}

/** How far the knock that runs is, from 0 to 1; null between knocks. */
function knockProgressAt(timeInCycle: number): number | null {
  for (const knockStart of ASK_TIMELINE.KNOCK_STARTS_MILLISECONDS) {
    const sinceKnock = timeInCycle - knockStart;
    if (sinceKnock >= 0 && sinceKnock < ASK_TIMELINE.KNOCK_MILLISECONDS) return sinceKnock / ASK_TIMELINE.KNOCK_MILLISECONDS;
  }
  return null;
}

/** The arcs show as each knock starts and fade over their fade time; the later knock shows over the earlier. */
function knockArcsOpacityAt(timeInCycle: number): number {
  return Math.max(0, ...ASK_TIMELINE.KNOCK_STARTS_MILLISECONDS.map((knockStart) => {
    const sinceKnock = timeInCycle - knockStart;
    return sinceKnock >= 0 && sinceKnock < ASK_TIMELINE.KNOCK_ARCS_FADE_MILLISECONDS ? 1 - (sinceKnock / ASK_TIMELINE.KNOCK_ARCS_FADE_MILLISECONDS) : 0;
  }));
}

function askKnockPartOf(elapsedMilliseconds: number): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(elapsedMilliseconds, ASK_TIMELINE.KNOCK_CYCLE_MILLISECONDS);
  const knockProgress = knockProgressAt(timeInCycle);
  const knock = knockProgress === null ? 0 : Math.sin(Math.PI * knockProgress);
  return {
    body:     { leanDegrees: ASK_KNOCK_POSE.LEAN_DEGREES, addedLift: ASK_KNOCK_POSE.KNOCK_LIFT_UNITS * knock },
    eyes:     { height: ASK_KNOCK_POSE.EYE_HEIGHT_UNITS, shift: ASK_KNOCK_POSE.EYE_SHIFT_UNITS },
    nearHand: {
      cornerCount: HAND_SHAPE.TYPING_CORNER_COUNT,
      centreX:     ASK_KNOCK_POSE.KNUCKLE_CENTRE_X_UNITS,
      centreY:     ASK_KNOCK_POSE.KNUCKLE_CENTRE_Y_UNITS,
      radius:      ASK_KNOCK_POSE.KNUCKLE_RADIUS_UNITS + ((ASK_KNOCK_POSE.KNOCK_RADIUS_UNITS - ASK_KNOCK_POSE.KNUCKLE_RADIUS_UNITS) * knock),
      turnDegrees: ASK_KNOCK_POSE.KNUCKLE_TURN_DEGREES,
      placement:   'eased',
    },
    farHand: {
      cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT, centreX: 0, centreY: 0, radius: ASK_KNOCK_POSE.FAR_HAND_RADIUS_UNITS, turnDegrees: 0, placement: { heldTo: 'askCard' },
    },
    props: {
      askCard: {
        shown: 1, scale: ASK_KNOCK_POSE.CARD_SCALE, offsetY: ASK_KNOCK_POSE.CARD_DROP_UNITS, turnDegrees: 0,
      },
      knockArcs: {
        shown:   1,
        centreX: ASK_KNOCK_POSE.KNUCKLE_CENTRE_X_UNITS,
        centreY: ASK_KNOCK_POSE.KNUCKLE_CENTRE_Y_UNITS,
        opacity: knockArcsOpacityAt(timeInCycle),
      },
    },
  };
}

export const ASK_GESTURE = gestureDefinition({
  name:    'ask',
  intents: {
    'ask':       { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: ASK_TIMELINE.ASK_STILL_MOMENT_MILLISECONDS },
    'ask-knock': { variant: 'knock', durationMilliseconds: null, stillMomentMilliseconds: ASK_TIMELINE.KNOCK_STILL_MOMENT_MILLISECONDS },
  },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            (input: GestureInput<AskVariant>) => (input.variant === 'knock'
    ? askKnockPartOf(input.elapsedMilliseconds)
    : askPartOf(input.elapsedMilliseconds)),
});
