/**
 * Implements `02-animations.md`, "Gestures", "Type": two squares tap in turn on the keyboard. In the normal and busy moods the far hand
 * taps opposite to the near hand; in the angry mood each hand slams, the far hand half a cycle later, and the keyboard jolts down.
 */
import type { HandPose, PosePart } from '../SpritePose.ts';
import { HAND_SHAPE }              from '../constants/HandShape.ts';
import {
  ANGRY_TYPING,
  BUSY_TYPING,
  KEYBOARD_JOLT,
  NORMAL_TYPING,
  TYPE_GESTURE_VALUES,
  TYPING_SLAM
} from '../constants/TypeGestureValues.ts';
import { AnimationCurveUtil }           from '../utils/AnimationCurveUtil.ts';
import type { GestureDefinition, Mood } from './GestureDefinition.ts';
import { workingMoodPartOf }            from './WorkingMoodPart.ts';

interface Taps {
  readonly nearHand: number;
  readonly farHand:  number;
}

/** Raised for the first share of the cycle, a straight fall to the key, then on the key until the cycle ends. */
function slamTapAt(cycleProgress: number): number {
  if (cycleProgress < TYPING_SLAM.FALL_START_FRACTION) return TYPING_SLAM.RAISED_UNITS;
  if (cycleProgress < TYPING_SLAM.FALL_END_FRACTION) {
    const fallProgress = (cycleProgress - TYPING_SLAM.FALL_START_FRACTION) / (TYPING_SLAM.FALL_END_FRACTION - TYPING_SLAM.FALL_START_FRACTION);
    return TYPING_SLAM.RAISED_UNITS * (1 - fallProgress);
  }
  return 0;
}

function alternatingTapsAt(elapsedMilliseconds: number, depthUnits: number, divisorMilliseconds: number): Taps {
  const swing = TYPE_GESTURE_VALUES.TAP_MIDDLE * Math.sin(elapsedMilliseconds / divisorMilliseconds);
  return { nearHand: -depthUnits * (TYPE_GESTURE_VALUES.TAP_MIDDLE + swing), farHand: -depthUnits * (TYPE_GESTURE_VALUES.TAP_MIDDLE - swing) };
}

function tapsAt(mood: Mood, elapsedMilliseconds: number): Taps {
  if (mood === 'normal') return alternatingTapsAt(elapsedMilliseconds, NORMAL_TYPING.TAP_DEPTH_UNITS, NORMAL_TYPING.TAP_DIVISOR_MILLISECONDS);
  if (mood === 'busy') return alternatingTapsAt(elapsedMilliseconds, BUSY_TYPING.TAP_DEPTH_UNITS, BUSY_TYPING.TAP_DIVISOR_MILLISECONDS);
  const nearProgress = AnimationCurveUtil.cycleProgressOf(elapsedMilliseconds, TYPING_SLAM.CYCLE_MILLISECONDS);
  const farHandDelayMilliseconds = TYPING_SLAM.FAR_HAND_DELAY_FRACTION * TYPING_SLAM.CYCLE_MILLISECONDS;
  const farProgress = AnimationCurveUtil.cycleProgressOf(elapsedMilliseconds + farHandDelayMilliseconds, TYPING_SLAM.CYCLE_MILLISECONDS);
  return { nearHand: slamTapAt(nearProgress), farHand: slamTapAt(farProgress) };
}

function typingEyesAt(mood: Mood, elapsedMilliseconds: number): PosePart['eyes'] {
  if (mood === 'normal') return { lift: NORMAL_TYPING.EYE_LIFT_UNITS };
  if (mood === 'angry') return { lift: ANGRY_TYPING.EYE_LIFT_UNITS };
  const step = Math.floor(elapsedMilliseconds / BUSY_TYPING.EYE_SHIFT_STEP_MILLISECONDS) % BUSY_TYPING.EYE_SHIFTS_UNITS.length;
  return { lift: BUSY_TYPING.EYE_LIFT_UNITS, shift: BUSY_TYPING.EYE_SHIFTS_UNITS[step] ?? BUSY_TYPING.EYE_SHIFTS_UNITS[0] };
}

function keyboardDropAt(mood: Mood, elapsedMilliseconds: number): number {
  if (mood !== 'angry') return 0;
  return AnimationCurveUtil.cycleProgressOf(elapsedMilliseconds, KEYBOARD_JOLT.CYCLE_MILLISECONDS) > KEYBOARD_JOLT.START_FRACTION ? KEYBOARD_JOLT.DROP_UNITS : 0;
}

function typingHand(centreX: number, centreY: number, radius: number): HandPose {
  return {
    cornerCount: HAND_SHAPE.TYPING_CORNER_COUNT, centreX, centreY, radius, turnDegrees: TYPE_GESTURE_VALUES.HAND_TURN_DEGREES, placement: 'eased',
  };
}

export const TYPE_GESTURE = Object.freeze<GestureDefinition>({
  name:                    'type',
  moods:                   ['normal', 'busy', 'angry'],
  durationMilliseconds:    null,
  continuesWhileWalking:   false,
  continuesWhileJumping:   false,
  stillMomentMilliseconds: 0,
  verdict:                 null,
  targetPose:              (input) => {
    const moodPart = workingMoodPartOf(input.mood, input.elapsedMilliseconds);
    const taps = tapsAt(input.mood, input.elapsedMilliseconds);
    return {
      ...moodPart,
      eyes:     { ...moodPart.eyes, ...typingEyesAt(input.mood, input.elapsedMilliseconds) },
      nearHand: typingHand(TYPE_GESTURE_VALUES.NEAR_HAND_CENTRE_X_UNITS, TYPE_GESTURE_VALUES.NEAR_HAND_CENTRE_Y_UNITS + taps.nearHand, TYPE_GESTURE_VALUES.NEAR_HAND_RADIUS_UNITS),
      farHand:  typingHand(TYPE_GESTURE_VALUES.FAR_HAND_CENTRE_X_UNITS, TYPE_GESTURE_VALUES.FAR_HAND_CENTRE_Y_UNITS + taps.farHand, TYPE_GESTURE_VALUES.FAR_HAND_RADIUS_UNITS),
      props:    { keyboard: { shown: 1, drop: keyboardDropAt(input.mood, input.elapsedMilliseconds) } },
    };
  },
});
