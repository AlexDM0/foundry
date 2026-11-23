/**
 * Held: an entrance in which a ready ticket fades in, a clamp slides down over it and a hexagon
 * fastens it; then a steady pose in which Flint faces the user and holds up a square as a flat palm.
 */
import type { HandPose, PosePart }                     from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }                       from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                                  from '../../constants/HandShape.ts';
import type { GestureInput }                           from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }             from '../GestureDefinition.ts';
import { GestureTimelineUtil }                         from '../GestureTimelineUtil.ts';
import { NORMAL_WORKING_VARIANT }                      from '../constants/WorkingVariantValues.ts';
import { HELD_TICKET_SHAPE, HOLD_POSE, HOLD_TIMELINE } from './constants/HoldValues.ts';

function fastenerAt(elapsedMilliseconds: number): HandPose {
  const fastening = GestureTimelineUtil.progressBetween(elapsedMilliseconds, HOLD_TIMELINE.FASTEN_STARTS_MILLISECONDS, HOLD_TIMELINE.PALM_STARTS_MILLISECONDS);
  return {
    cornerCount: HAND_SHAPE.FASTENING_CORNER_COUNT,
    centreX:     HOLD_POSE.FASTENER_CENTRE_X_UNITS,
    centreY:     HOLD_POSE.FASTENER_CENTRE_Y_UNITS,
    radius:      HOLD_POSE.FASTENER_RADIUS_UNITS,
    turnDegrees: HOLD_POSE.FASTENER_TURN_DEGREES * fastening,
    placement:   'eased',
  };
}

function palmAt(elapsedMilliseconds: number): HandPose {
  return {
    cornerCount: HAND_SHAPE.TYPING_CORNER_COUNT,
    centreX:     HOLD_POSE.PALM_CENTRE_X_UNITS,
    centreY:     HOLD_POSE.PALM_CENTRE_Y_UNITS + (HOLD_POSE.PALM_SWAY_UNITS * Math.sin(elapsedMilliseconds / HOLD_POSE.PALM_SWAY_DIVISOR_MILLISECONDS)),
    radius:      HOLD_POSE.PALM_RADIUS_UNITS,
    turnDegrees: HOLD_POSE.PALM_TURN_DEGREES,
    placement:   'eased',
  };
}

function holdPartOf(input: GestureInput): PosePart {
  const { elapsedMilliseconds } = input;
  const arriving = GestureTimelineUtil.progressBetween(elapsedMilliseconds, 0, HOLD_TIMELINE.FASTEN_STARTS_MILLISECONDS);
  const props = { heldTicket: { shown: 1, opacity: arriving, clampOffsetY: -HELD_TICKET_SHAPE.CLAMP_SLIDE_UNITS * (1 - arriving) }, };
  if (elapsedMilliseconds >= HOLD_TIMELINE.PALM_STARTS_MILLISECONDS) {
    return {
      body:     { leanDegrees: HOLD_POSE.PALM_LEAN_DEGREES },
      eyes:     { height: HOLD_POSE.PALM_EYE_HEIGHT_UNITS, shift: HOLD_POSE.PALM_EYE_SHIFT_UNITS },
      nearHand: palmAt(elapsedMilliseconds),
      farHand:  null,
      props,
    };
  }
  const isFastening = elapsedMilliseconds >= HOLD_TIMELINE.FASTEN_STARTS_MILLISECONDS;
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     { height: isFastening ? HOLD_POSE.FASTEN_EYE_HEIGHT_UNITS : NORMAL_WORKING_VARIANT.EYE_HEIGHT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS },
    nearHand: isFastening ? fastenerAt(elapsedMilliseconds) : null,
    farHand:  null,
    props,
  };
}

export const HOLD_GESTURE = gestureDefinition({
  name:                  'hold',
  intents:               { hold: singleFormOf(null, HOLD_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            holdPartOf,
});
