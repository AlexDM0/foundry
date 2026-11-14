/**
 * Typing (`02-animations.md`, "Type"), as every gesture that types shares it: the square of each hand on its key, the alternating tap of
 * the two hands, and the whole part of normal typing that Gate failed, Sandbox and Wind-down start from.
 */
import type { HandPose, PosePart }     from '../SpritePose.ts';
import { HAND_SHAPE }                  from '../constants/HandShape.ts';
import { workingVariantPartOf }        from './WorkingVariantPart.ts';
import { NORMAL_TYPING, TYPING_HANDS } from './constants/TypingHands.ts';

export type TypingHandSide = 'near' | 'far';

export interface TypingHands {
  readonly nearHand: HandPose;
  readonly farHand:  HandPose;
}

export const TypingUtil = Object.freeze({
  /** The square of one hand on its key, raised by the tap given; negative is up. */
  handOnKeyOf: (side: TypingHandSide, tapUnits: number): HandPose => ({
    cornerCount: HAND_SHAPE.TYPING_CORNER_COUNT,
    centreX:     side === 'near' ? TYPING_HANDS.NEAR_HAND_CENTRE_X_UNITS : TYPING_HANDS.FAR_HAND_CENTRE_X_UNITS,
    centreY:     (side === 'near' ? TYPING_HANDS.NEAR_HAND_CENTRE_Y_UNITS : TYPING_HANDS.FAR_HAND_CENTRE_Y_UNITS) + tapUnits,
    radius:      side === 'near' ? TYPING_HANDS.NEAR_HAND_RADIUS_UNITS : TYPING_HANDS.FAR_HAND_RADIUS_UNITS,
    turnDegrees: TYPING_HANDS.HAND_TURN_DEGREES,
    placement:   'eased',
  }),

  /** The tap of one hand of alternating typing at the divisor given; the far hand taps opposite to the near hand. */
  alternatingTapOf: (side: TypingHandSide, elapsedMilliseconds: number, depthUnits: number, divisorMilliseconds: number): number => {
    const swing = TYPING_HANDS.TAP_MIDDLE * Math.sin(elapsedMilliseconds / divisorMilliseconds);
    return -depthUnits * (TYPING_HANDS.TAP_MIDDLE + (side === 'near' ? swing : -swing));
  },

  /** Both hands of normal typing, at its own rate unless a slower divisor is given. */
  normalTypingHandsAt: (elapsedMilliseconds: number, divisorMilliseconds: number = NORMAL_TYPING.TAP_DIVISOR_MILLISECONDS): TypingHands => ({
    nearHand: TypingUtil.handOnKeyOf('near', TypingUtil.alternatingTapOf('near', elapsedMilliseconds, NORMAL_TYPING.TAP_DEPTH_UNITS, divisorMilliseconds)),
    farHand:  TypingUtil.handOnKeyOf('far', TypingUtil.alternatingTapOf('far', elapsedMilliseconds, NORMAL_TYPING.TAP_DEPTH_UNITS, divisorMilliseconds)),
  }),

  /** Type in its normal variant: the working lean and eyes, the eyes on the keys, both hands typing and the keyboard. */
  normalTypingPartOf: (elapsedMilliseconds: number, divisorMilliseconds: number = NORMAL_TYPING.TAP_DIVISOR_MILLISECONDS): PosePart => {
    const variantPart = workingVariantPartOf('normal', elapsedMilliseconds);
    return {
      ...variantPart,
      eyes:  { ...variantPart.eyes, lift: NORMAL_TYPING.EYE_LIFT_UNITS },
      ...TypingUtil.normalTypingHandsAt(elapsedMilliseconds, divisorMilliseconds),
      props: { keyboard: { shown: 1, drop: 0 } },
    };
  },
});
