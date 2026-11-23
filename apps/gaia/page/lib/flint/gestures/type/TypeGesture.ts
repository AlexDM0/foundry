/**
 * Type: two squares tap in turn on the keyboard. In the normal and busy variants the far hand
 * taps opposite to the near hand; in the angry variant each hand slams, the far hand half a cycle later, and the keyboard jolts down.
 */
import type { PosePart }        from '../../SpritePose.ts';
import { AnimationCurveUtil }   from '../../utils/AnimationCurveUtil.ts';
import { gestureDefinition }    from '../GestureDefinition.ts';
import type { GestureInput }    from '../GestureDefinition.ts';
import { TypingUtil }           from '../TypingUtil.ts';
import type { WorkingVariant }  from '../WorkingVariantPart.ts';
import { workingVariantPartOf } from '../WorkingVariantPart.ts';
import { NORMAL_TYPING }        from '../constants/TypingHands.ts';
import {
  ANGRY_TYPING,
  BUSY_TYPING,
  KEYBOARD_JOLT,
  TYPING_SLAM,
} from './constants/TypeValues.ts';

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
  return {
    nearHand: TypingUtil.alternatingTapOf('near', elapsedMilliseconds, depthUnits, divisorMilliseconds),
    farHand:  TypingUtil.alternatingTapOf('far', elapsedMilliseconds, depthUnits, divisorMilliseconds),
  };
}

function tapsAt(variant: WorkingVariant, elapsedMilliseconds: number): Taps {
  if (variant === 'normal') return alternatingTapsAt(elapsedMilliseconds, NORMAL_TYPING.TAP_DEPTH_UNITS, NORMAL_TYPING.TAP_DIVISOR_MILLISECONDS);
  if (variant === 'busy') return alternatingTapsAt(elapsedMilliseconds, BUSY_TYPING.TAP_DEPTH_UNITS, BUSY_TYPING.TAP_DIVISOR_MILLISECONDS);
  const nearProgress = AnimationCurveUtil.cycleProgressOf(elapsedMilliseconds, TYPING_SLAM.CYCLE_MILLISECONDS);
  const farHandDelayMilliseconds = TYPING_SLAM.FAR_HAND_DELAY_FRACTION * TYPING_SLAM.CYCLE_MILLISECONDS;
  const farProgress = AnimationCurveUtil.cycleProgressOf(elapsedMilliseconds + farHandDelayMilliseconds, TYPING_SLAM.CYCLE_MILLISECONDS);
  return { nearHand: slamTapAt(nearProgress), farHand: slamTapAt(farProgress) };
}

function typingEyesAt(variant: WorkingVariant, elapsedMilliseconds: number): PosePart['eyes'] {
  if (variant === 'normal') return { lift: NORMAL_TYPING.EYE_LIFT_UNITS };
  if (variant === 'angry') return { lift: ANGRY_TYPING.EYE_LIFT_UNITS };
  const step = Math.floor(elapsedMilliseconds / BUSY_TYPING.EYE_SHIFT_STEP_MILLISECONDS) % BUSY_TYPING.EYE_SHIFTS_UNITS.length;
  return { lift: BUSY_TYPING.EYE_LIFT_UNITS, shift: BUSY_TYPING.EYE_SHIFTS_UNITS[step] ?? BUSY_TYPING.EYE_SHIFTS_UNITS[0] };
}

function keyboardDropAt(variant: WorkingVariant, elapsedMilliseconds: number): number {
  if (variant !== 'angry') return 0;
  return AnimationCurveUtil.cycleProgressOf(elapsedMilliseconds, KEYBOARD_JOLT.CYCLE_MILLISECONDS) > KEYBOARD_JOLT.START_FRACTION ? KEYBOARD_JOLT.DROP_UNITS : 0;
}

function typePartOf(input: GestureInput<WorkingVariant>): PosePart {
  const variantPart = workingVariantPartOf(input.variant, input.elapsedMilliseconds);
  const taps = tapsAt(input.variant, input.elapsedMilliseconds);
  return {
    ...variantPart,
    eyes:     { ...variantPart.eyes, ...typingEyesAt(input.variant, input.elapsedMilliseconds) },
    nearHand: TypingUtil.handOnKeyOf('near', taps.nearHand),
    farHand:  TypingUtil.handOnKeyOf('far', taps.farHand),
    props:    { keyboard: { shown: 1, drop: keyboardDropAt(input.variant, input.elapsedMilliseconds) } },
  };
}

export const TYPE_GESTURE = gestureDefinition({
  name:    'type',
  intents: {
    'type':       { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 0 },
    'type-busy':  { variant: 'busy', durationMilliseconds: null, stillMomentMilliseconds: 0 },
    'type-angry': { variant: 'angry', durationMilliseconds: null, stillMomentMilliseconds: 0 },
  },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            typePartOf,
});
