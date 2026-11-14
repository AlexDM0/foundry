/**
 * The part of the pose that typing and reviewing share for each mood (`02-animations.md`, "Type" and "Review"): the working lean and
 * eye shift, the eye height, the bob of the busy mood, and the shake, glare and pulsing vein of the angry mood.
 */
import type { EmoteMarkPose, PosePart }                      from '../SpritePose.ts';
import { emoteMarkAtRest }                                   from '../SpritePose.ts';
import { EYE_SHAPE }                                         from '../constants/BodyShape.ts';
import { ANGRY_WORK_MOOD, BUSY_WORK_MOOD, NORMAL_WORK_MOOD } from '../constants/WorkingMoodValues.ts';
import type { Mood }                                         from './GestureDefinition.ts';

/** The vein of an angry mood shows at once, with no spring, and only pulses; it stops with its gesture, with no fade. */
function angerVeinAt(elapsedMilliseconds: number): EmoteMarkPose {
  const pulse = 1 + (ANGRY_WORK_MOOD.VEIN_PULSE_FACTOR * Math.sin(elapsedMilliseconds / ANGRY_WORK_MOOD.VEIN_PULSE_DIVISOR_MILLISECONDS));
  return { ...emoteMarkAtRest('anger-vein'), innerScaleX: pulse, innerScaleY: pulse };
}

export function workingMoodPartOf(mood: Mood, elapsedMilliseconds: number): PosePart {
  if (mood === 'busy') {
    return {
      body: {
        leanDegrees: BUSY_WORK_MOOD.LEAN_DEGREES,
        addedLift:   BUSY_WORK_MOOD.BOB_UNITS * Math.sin(elapsedMilliseconds / BUSY_WORK_MOOD.BOB_DIVISOR_MILLISECONDS),
      },
      eyes: { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: BUSY_WORK_MOOD.EYE_HEIGHT_UNITS },
    };
  }
  if (mood === 'angry') {
    return {
      body: {
        leanDegrees: ANGRY_WORK_MOOD.LEAN_DEGREES,
        addedShake:  ANGRY_WORK_MOOD.SHAKE_UNITS * Math.sin(elapsedMilliseconds / ANGRY_WORK_MOOD.SHAKE_DIVISOR_MILLISECONDS),
      },
      eyes:      { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: ANGRY_WORK_MOOD.EYE_HEIGHT_UNITS, slantDegrees: ANGRY_WORK_MOOD.EYE_SLANT_DEGREES },
      emoteMark: angerVeinAt(elapsedMilliseconds),
    };
  }
  return {
    body: { leanDegrees: NORMAL_WORK_MOOD.LEAN_DEGREES },
    eyes: { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: NORMAL_WORK_MOOD.EYE_HEIGHT_UNITS },
  };
}
