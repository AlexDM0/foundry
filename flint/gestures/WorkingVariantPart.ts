/**
 * The part of the pose that typing and reviewing share for each of their variants (`02-animations.md`, "Type" and "Review", where they
 * are called moods): the working lean and eye shift, the eye height, the bob of the busy variant, and the shake, glare and pulsing vein of
 * the angry variant.
 */
import type { EmoteMarkPoseOf, PosePart }                                      from '../SpritePose.ts';
import { emoteMarkAtRest }                                                     from '../SpritePose.ts';
import { EYE_SHAPE }                                                           from '../constants/BodyShape.ts';
import { ANGRY_WORKING_VARIANT, BUSY_WORKING_VARIANT, NORMAL_WORKING_VARIANT } from './constants/WorkingVariantValues.ts';

/** The variants that typing and reviewing share; the playground calls the normal one `calm`. */
export type WorkingVariant = 'normal' | 'busy' | 'angry';

/** The vein of an angry variant shows at once, with no spring, and only pulses; it stops with its gesture, with no fade. */
function angerVeinAt(elapsedMilliseconds: number): EmoteMarkPoseOf<'anger-vein'> {
  const pulse = 1 + (ANGRY_WORKING_VARIANT.VEIN_PULSE_FACTOR * Math.sin(elapsedMilliseconds / ANGRY_WORKING_VARIANT.VEIN_PULSE_DIVISOR_MILLISECONDS));
  return { ...emoteMarkAtRest('anger-vein'), innerScaleX: pulse, innerScaleY: pulse };
}

export function workingVariantPartOf(variant: WorkingVariant, elapsedMilliseconds: number): PosePart {
  if (variant === 'busy') {
    return {
      body: {
        leanDegrees: BUSY_WORKING_VARIANT.LEAN_DEGREES,
        addedLift:   BUSY_WORKING_VARIANT.BOB_UNITS * Math.sin(elapsedMilliseconds / BUSY_WORKING_VARIANT.BOB_DIVISOR_MILLISECONDS),
      },
      eyes: { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: BUSY_WORKING_VARIANT.EYE_HEIGHT_UNITS },
    };
  }
  if (variant === 'angry') {
    return {
      body: {
        leanDegrees: ANGRY_WORKING_VARIANT.LEAN_DEGREES,
        addedShake:  ANGRY_WORKING_VARIANT.SHAKE_UNITS * Math.sin(elapsedMilliseconds / ANGRY_WORKING_VARIANT.SHAKE_DIVISOR_MILLISECONDS),
      },
      eyes:      { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: ANGRY_WORKING_VARIANT.EYE_HEIGHT_UNITS, slantDegrees: ANGRY_WORKING_VARIANT.EYE_SLANT_DEGREES },
      emoteMark: angerVeinAt(elapsedMilliseconds),
    };
  }
  return {
    body: { leanDegrees: NORMAL_WORKING_VARIANT.LEAN_DEGREES },
    eyes: { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: NORMAL_WORKING_VARIANT.EYE_HEIGHT_UNITS },
  };
}
