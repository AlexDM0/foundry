/**
 * Crash resume: Flint flickers out to an outline, lies landed with one spark at its centre, fills
 * again bright, shakes its head with two blinks and looks behind, then ahead. The flicker, the fill and the tint are set on each frame.
 */
import type {
  BodyPart,
  EyesPose,
  ExactField,
  PosePart
} from '../../SpritePose.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import type { CrashSparkState }            from './CrashSparkProp.ts';
import {
  CORE_SPARK,
  CRASH_RESUME,
  FLICKER,
  HEAD_SHAKE,
  LOOK_AROUND,
  RESTORE,
  SHOCK,
  SLUMP
} from './constants/CrashResumeValues.ts';

const { progressBetween } = GestureTimelineUtil;

/** The fill opacity this frame sets, or null when the body keeps its full fill. */
function fillOpacityAt(elapsedMilliseconds: number): number | null {
  if (elapsedMilliseconds >= RESTORE.FILLED_MILLISECONDS) return null;
  if (elapsedMilliseconds >= RESTORE.STARTS_MILLISECONDS) return progressBetween(elapsedMilliseconds, RESTORE.STARTS_MILLISECONDS, RESTORE.FILLED_MILLISECONDS);
  const flickerIndex = FLICKER.MOMENTS_MILLISECONDS.filter((moment) => moment <= elapsedMilliseconds).length - 1;
  return flickerIndex < 0 ? null : FLICKER.FILL_OPACITIES[flickerIndex] ?? null;
}

function isBlinkingAt(elapsedMilliseconds: number): boolean {
  return HEAD_SHAKE.BLINKS_MILLISECONDS.some((blink) => elapsedMilliseconds >= blink.STARTS && elapsedMilliseconds < blink.ENDS);
}

function isSlumpedAt(elapsedMilliseconds: number): boolean {
  return elapsedMilliseconds >= SLUMP.STARTS_MILLISECONDS && elapsedMilliseconds < SLUMP.ENDS_MILLISECONDS;
}

/** The eye height this frame sets at once: wide in the shock, shut while Flint is out and in each blink; null leaves it to the easing. */
function exactEyeHeightAt(elapsedMilliseconds: number): number | null {
  if (elapsedMilliseconds < SHOCK.ENDS_MILLISECONDS) return SHOCK.EYE_HEIGHT_UNITS;
  if (isSlumpedAt(elapsedMilliseconds)) return FLICKER.OUT_EYE_HEIGHT_UNITS;
  if (isBlinkingAt(elapsedMilliseconds)) return HEAD_SHAKE.CLOSED_EYE_HEIGHT_UNITS;
  return null;
}

function eyesAt(elapsedMilliseconds: number): Partial<EyesPose> {
  const exactHeight = exactEyeHeightAt(elapsedMilliseconds);
  const isShocked = elapsedMilliseconds < SLUMP.STARTS_MILLISECONDS;
  const height = exactHeight ?? (isShocked ? SHOCK.EYE_HEIGHT_UNITS : null);
  const isLookingAround = elapsedMilliseconds >= LOOK_AROUND.STARTS_MILLISECONDS;
  const shift = elapsedMilliseconds < LOOK_AROUND.AHEAD_MILLISECONDS ? LOOK_AROUND.BEHIND_EYE_SHIFT_UNITS : LOOK_AROUND.AHEAD_EYE_SHIFT_UNITS;
  return {
    ...(height === null ? {} : { height }),
    ...(isLookingAround ? { shift } : {}),
  };
}

function bodyAt(elapsedMilliseconds: number, fillOpacity: number | null): BodyPart {
  const isBright = elapsedMilliseconds >= RESTORE.STARTS_MILLISECONDS && elapsedMilliseconds < RESTORE.TINT_OUT_MILLISECONDS;
  const tintOut = progressBetween(elapsedMilliseconds, RESTORE.STARTS_MILLISECONDS, RESTORE.TINT_OUT_MILLISECONDS);
  const isShaking = elapsedMilliseconds >= HEAD_SHAKE.STARTS_MILLISECONDS && elapsedMilliseconds < HEAD_SHAKE.ENDS_MILLISECONDS;
  const shakeDying = 1 - progressBetween(elapsedMilliseconds, HEAD_SHAKE.STARTS_MILLISECONDS, HEAD_SHAKE.ENDS_MILLISECONDS);
  return {
    ...(fillOpacity === null ? {} : { fillOpacity }),
    ...(isSlumpedAt(elapsedMilliseconds) ? { hover: SLUMP.HOVER_UNITS, leanDegrees: SLUMP.LEAN_DEGREES } : {}),
    ...(isBright ? { tint: { role: 'emberLight', amount: RESTORE.TINT_AMOUNT * (1 - tintOut) } } : {}),
    ...(isShaking ? { addedShake: HEAD_SHAKE.SHAKE_UNITS * shakeDying * Math.sin(elapsedMilliseconds / HEAD_SHAKE.SHAKE_DIVISOR_MILLISECONDS) } : {}),
  };
}

function coreSparkAt(elapsedMilliseconds: number): CrashSparkState {
  return {
    shown: 1,
    scale: 1 + (CORE_SPARK.PULSE_SCALE * Math.sin(elapsedMilliseconds / CORE_SPARK.PULSE_DIVISOR_MILLISECONDS)),
    fade:  1 - progressBetween(elapsedMilliseconds, CORE_SPARK.FADES_MILLISECONDS, CORE_SPARK.GONE_MILLISECONDS),
  };
}

function crashResumePartOf(input: GestureInput): PosePart {
  const { elapsedMilliseconds } = input;
  const fillOpacity = fillOpacityAt(elapsedMilliseconds);
  const isSparkShown = elapsedMilliseconds >= CORE_SPARK.SHOWS_MILLISECONDS && elapsedMilliseconds < CORE_SPARK.GONE_MILLISECONDS;
  const isBright = elapsedMilliseconds >= RESTORE.STARTS_MILLISECONDS && elapsedMilliseconds < RESTORE.TINT_OUT_MILLISECONDS;
  const exactFields: ExactField[] = [
    ...(fillOpacity === null ? [] : ['fill-opacity'] as const),
    ...(exactEyeHeightAt(elapsedMilliseconds) === null ? [] : ['eye-height'] as const),
    ...(isBright ? ['tint'] as const : []),
  ];
  return {
    body:     bodyAt(elapsedMilliseconds, fillOpacity),
    eyes:     eyesAt(elapsedMilliseconds),
    nearHand: null,
    farHand:  null,
    ...(isSparkShown ? { props: { crashSpark: coreSparkAt(elapsedMilliseconds) } } : {}),
    ...(exactFields.length === 0 ? {} : { exactFields }),
  };
}

export const CRASH_RESUME_GESTURE = gestureDefinition({
  name:                  'crash-resume',
  intents:               { 'crash-resume': singleFormOf(CRASH_RESUME.DURATION_MILLISECONDS, CRASH_RESUME.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            crashResumePartOf,
});
