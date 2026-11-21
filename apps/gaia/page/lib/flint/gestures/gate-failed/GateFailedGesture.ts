/**
 * Implements `06-more-animations.md`, "Gate failed": Flint types in the normal variant of Type until a crimson note falls onto the keyboard;
 * it flinches with a crimson tint that fades in a straight line, draws its hands back, looks down at the note, sighs, and puts its hands
 * back on the keys. One action; the host then starts the typing of the next variant.
 */
import type {
  BodyPart,
  EyesPose,
  HandPose,
  PosePart,
} from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }                                   from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                                              from '../../constants/HandShape.ts';
import type { GestureInput }                                       from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }                         from '../GestureDefinition.ts';
import { GestureTimelineUtil }                                     from '../GestureTimelineUtil.ts';
import { TypingUtil }                                              from '../TypingUtil.ts';
import { TYPING_HANDS, NORMAL_TYPING }                             from '../constants/TypingHands.ts';
import { NORMAL_WORKING_VARIANT }                                  from '../constants/WorkingVariantValues.ts';
import type { GateNoteState }                                      from './GateNoteProp.ts';
import { GATE_FAILED_POSE, GATE_FAILED_TIMELINE, GATE_NOTE_SHAPE } from './constants/GateFailedValues.ts';

const { progressBetween } = GestureTimelineUtil;

function typingSquare(centreX: number, centreY: number, radius: number): HandPose {
  return {
    cornerCount: HAND_SHAPE.TYPING_CORNER_COUNT, centreX, centreY, radius, turnDegrees: TYPING_HANDS.HAND_TURN_DEGREES, placement: 'eased',
  };
}

function keyboardDropAt(elapsedMilliseconds: number): number {
  const isJolted = elapsedMilliseconds >= GATE_FAILED_TIMELINE.NOTE_LANDS_MILLISECONDS && elapsedMilliseconds < GATE_FAILED_TIMELINE.KEYBOARD_JOLT_ENDS_MILLISECONDS;
  return isJolted ? GATE_FAILED_POSE.KEYBOARD_JOLT_UNITS : 0;
}

/** It falls with `p²` and lands on the keyboard, going down with it in the jolt; it fades out while the hands go back to the keys. */
function noteAt(elapsedMilliseconds: number): GateNoteState {
  const fall = progressBetween(elapsedMilliseconds, 0, GATE_FAILED_TIMELINE.NOTE_LANDS_MILLISECONDS);
  const fallUnits = GATE_NOTE_SHAPE.LANDED_TOP_Y_UNITS - GATE_NOTE_SHAPE.START_TOP_Y_UNITS;
  return {
    shown:   1,
    topY:    GATE_NOTE_SHAPE.START_TOP_Y_UNITS + (fallUnits * fall * fall) + keyboardDropAt(elapsedMilliseconds),
    opacity: 1 - progressBetween(elapsedMilliseconds, GATE_FAILED_TIMELINE.SIGH_ENDS_MILLISECONDS, GATE_FAILED_TIMELINE.DURATION_MILLISECONDS),
  };
}

function eyesAt(elapsedMilliseconds: number): Partial<EyesPose> {
  const shift = EYE_SHAPE.SHIFT_AT_WORK_UNITS;
  if (elapsedMilliseconds < GATE_FAILED_TIMELINE.STARTLED_EYES_END_MILLISECONDS) {
    return { shift, height: GATE_FAILED_POSE.STARTLED_EYE_HEIGHT_UNITS, lift: GATE_FAILED_POSE.STARTLED_EYE_LIFT_UNITS };
  }
  if (elapsedMilliseconds < GATE_FAILED_TIMELINE.SIGH_STARTS_MILLISECONDS) {
    return { shift, height: GATE_FAILED_POSE.DOWNCAST_EYE_HEIGHT_UNITS, lift: GATE_FAILED_POSE.DOWNCAST_EYE_LIFT_UNITS };
  }
  if (elapsedMilliseconds < GATE_FAILED_TIMELINE.SIGH_ENDS_MILLISECONDS) {
    return { shift, height: GATE_FAILED_POSE.SIGH_EYE_HEIGHT_UNITS, lift: GATE_FAILED_POSE.DOWNCAST_EYE_LIFT_UNITS };
  }
  return { shift, height: NORMAL_WORKING_VARIANT.EYE_HEIGHT_UNITS, lift: NORMAL_TYPING.EYE_LIFT_UNITS };
}

function leanAt(elapsedMilliseconds: number): number {
  if (elapsedMilliseconds < GATE_FAILED_TIMELINE.RECOIL_ENDS_MILLISECONDS) return GATE_FAILED_POSE.RECOIL_LEAN_DEGREES;
  return elapsedMilliseconds < GATE_FAILED_TIMELINE.SIGH_ENDS_MILLISECONDS ? GATE_FAILED_POSE.SETTLED_LEAN_DEGREES : BODY_SHAPE.WORKING_LEAN_DEGREES;
}

function bodyAt(elapsedMilliseconds: number): BodyPart {
  const isRecoiling = elapsedMilliseconds < GATE_FAILED_TIMELINE.RECOIL_ENDS_MILLISECONDS;
  const isSighing = elapsedMilliseconds >= GATE_FAILED_TIMELINE.SIGH_STARTS_MILLISECONDS && elapsedMilliseconds < GATE_FAILED_TIMELINE.SIGH_ENDS_MILLISECONDS;
  const flinch = progressBetween(elapsedMilliseconds, GATE_FAILED_TIMELINE.NOTE_LANDS_MILLISECONDS, GATE_FAILED_TIMELINE.FLINCH_ENDS_MILLISECONDS);
  const tintFade = progressBetween(elapsedMilliseconds, GATE_FAILED_TIMELINE.NOTE_LANDS_MILLISECONDS, GATE_FAILED_TIMELINE.RECOIL_ENDS_MILLISECONDS);
  return {
    leanDegrees: leanAt(elapsedMilliseconds),
    addedLift:   flinch > 0 && flinch < 1 ? GATE_FAILED_POSE.FLINCH_UNITS * Math.sin(Math.PI * flinch) : 0,
    ...(isRecoiling ? { tint: { role: 'alarm', amount: 1 - tintFade } } : {}),
    ...(isSighing ? { widthFactor: GATE_FAILED_POSE.SIGH_WIDTH_FACTOR, heightFactor: GATE_FAILED_POSE.SIGH_HEIGHT_FACTOR } : {}),
  };
}

function gateFailedPartOf(input: GestureInput): PosePart {
  const { elapsedMilliseconds } = input;
  const note = noteAt(elapsedMilliseconds);
  if (elapsedMilliseconds < GATE_FAILED_TIMELINE.NOTE_LANDS_MILLISECONDS) {
    const typing = TypingUtil.normalTypingPartOf(elapsedMilliseconds);
    return { ...typing, props: { ...typing.props, gateNote: note } };
  }
  const isBackOnTheKeys = elapsedMilliseconds >= GATE_FAILED_TIMELINE.SIGH_ENDS_MILLISECONDS;
  const isStartled = elapsedMilliseconds < GATE_FAILED_TIMELINE.STARTLED_EYES_END_MILLISECONDS;
  const isRecoiling = elapsedMilliseconds < GATE_FAILED_TIMELINE.RECOIL_ENDS_MILLISECONDS;
  return {
    body:     bodyAt(elapsedMilliseconds),
    eyes:     eyesAt(elapsedMilliseconds),
    nearHand: isBackOnTheKeys
      ? TypingUtil.handOnKeyOf('near', 0)
      : typingSquare(GATE_FAILED_POSE.NEAR_HAND_RECOIL_X_UNITS, GATE_FAILED_POSE.NEAR_HAND_RECOIL_Y_UNITS, GATE_FAILED_POSE.RECOIL_HAND_RADIUS_UNITS),
    farHand: isBackOnTheKeys
      ? TypingUtil.handOnKeyOf('far', 0)
      : typingSquare(GATE_FAILED_POSE.FAR_HAND_RECOIL_X_UNITS, GATE_FAILED_POSE.FAR_HAND_RECOIL_Y_UNITS, GATE_FAILED_POSE.RECOIL_HAND_RADIUS_UNITS),
    props:       { keyboard: { shown: 1, drop: keyboardDropAt(elapsedMilliseconds) }, gateNote: note },
    exactFields: [...(isStartled ? ['eye-height' as const] : []), ...(isRecoiling ? ['tint' as const] : [])],
  };
}

export const GATE_FAILED_GESTURE = gestureDefinition({
  name:                  'gate-failed',
  intents:               { 'gate-failed': singleFormOf(GATE_FAILED_TIMELINE.DURATION_MILLISECONDS, GATE_FAILED_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            gateFailedPartOf,
});
