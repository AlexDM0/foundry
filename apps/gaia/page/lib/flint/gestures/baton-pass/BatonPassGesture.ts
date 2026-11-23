/**
 * Baton pass: a new generation of Hephaestus, in one action. Flint tosses the baton up, flickers
 * out to its outline, returns bright with a glow and a hop, catches the falling baton, and is happy; then the baton and the hand fade.
 */
import type {
  EmoteMarkPoseOf,
  ExactField,
  EyesPose,
  HandPose,
  PosePart,
} from '../../SpritePose.ts';
import type { GestureInput }                                          from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }                            from '../GestureDefinition.ts';
import { GestureMarkUtil }                                            from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }                                        from '../GestureTimelineUtil.ts';
import type { BatonState }                                            from './BatonProp.ts';
import { BATON_PASS_FLICKER, BATON_PASS_MOTION, BATON_PASS_TIMELINE } from './constants/BatonPassValues.ts';

const { progressBetween } = GestureTimelineUtil;

const BATON_HAND: HandPose = Object.freeze({
  cornerCount: BATON_PASS_MOTION.HAND_CORNER_COUNT,
  centreX:     BATON_PASS_MOTION.HAND_CENTRE_X_UNITS,
  centreY:     BATON_PASS_MOTION.HAND_CENTRE_Y_UNITS,
  radius:      BATON_PASS_MOTION.HAND_RADIUS_UNITS,
  turnDegrees: 0,
  placement:   'eased',
});

/** Up with a turn, slowing as it rises; it hangs at the top; then it falls back with `p²` to the place it was held. */
function batonAt(elapsedMilliseconds: number): BatonState {
  const rise = BATON_PASS_MOTION.TOSSED_CENTRE_Y_UNITS - BATON_PASS_MOTION.HELD_CENTRE_Y_UNITS;
  const toss = progressBetween(elapsedMilliseconds, BATON_PASS_TIMELINE.TOSS_STARTS_MILLISECONDS, BATON_PASS_TIMELINE.TOSS_ENDS_MILLISECONDS);
  const fall = progressBetween(elapsedMilliseconds, BATON_PASS_TIMELINE.FALL_STARTS_MILLISECONDS, BATON_PASS_TIMELINE.CATCH_MILLISECONDS);
  const tossed = 1 - ((1 - toss) * (1 - toss));
  const isTossing = toss > 0 && toss < 1;
  return {
    shown:        1,
    cycleOpacity: 1 - progressBetween(elapsedMilliseconds, BATON_PASS_TIMELINE.HAPPY_ENDS_MILLISECONDS, BATON_PASS_TIMELINE.DURATION_MILLISECONDS),
    centreX:      BATON_PASS_MOTION.BATON_CENTRE_X_UNITS,
    centreY:      BATON_PASS_MOTION.HELD_CENTRE_Y_UNITS + (rise * tossed) - (rise * fall * fall),
    turnDegrees:  isTossing ? BATON_PASS_MOTION.TOSS_TURN_DEGREES * toss : 0,
  };
}

/** The flicker's fill opacity, set at once at each step; after the return the body is filled again. Null before the flicker. */
function fillOpacityAt(elapsedMilliseconds: number): number | null {
  if (elapsedMilliseconds >= BATON_PASS_TIMELINE.RETURN_MILLISECONDS) return 1;
  const step = BATON_PASS_FLICKER.filter((flicker) => elapsedMilliseconds >= flicker.MOMENT_MILLISECONDS).at(-1);
  return step === undefined ? null : step.FILL_OPACITY;
}

function isBetween(elapsedMilliseconds: number, startMilliseconds: number, endMilliseconds: number): boolean {
  return elapsedMilliseconds >= startMilliseconds && elapsedMilliseconds < endMilliseconds;
}

function eyesAt(elapsedMilliseconds: number): Partial<EyesPose> {
  const shift = { shift: BATON_PASS_MOTION.WORKING_EYE_SHIFT_UNITS };
  if (elapsedMilliseconds < BATON_PASS_TIMELINE.TOSS_STARTS_MILLISECONDS) return shift;
  if (elapsedMilliseconds < BATON_PASS_TIMELINE.OUTLINE_STARTS_MILLISECONDS) return { ...shift, lift: BATON_PASS_MOTION.WATCHING_EYE_LIFT_UNITS };
  if (elapsedMilliseconds < BATON_PASS_TIMELINE.RETURN_MILLISECONDS) return { ...shift, height: BATON_PASS_MOTION.OUTLINE_EYE_HEIGHT_UNITS };
  if (elapsedMilliseconds < BATON_PASS_TIMELINE.CATCH_MILLISECONDS) return { ...shift, height: BATON_PASS_MOTION.RETURN_EYE_HEIGHT_UNITS };
  if (elapsedMilliseconds < BATON_PASS_TIMELINE.HAPPY_ENDS_MILLISECONDS) return { happiness: 1 };
  return {};
}

/** The glints of the Happy emote, from the catch until the happy step ends. */
function glintsAt(elapsedMilliseconds: number): EmoteMarkPoseOf<'happy-glints'> | null {
  return GestureMarkUtil.springingMarkIn('happy-glints', elapsedMilliseconds, {
    startMilliseconds: BATON_PASS_TIMELINE.CATCH_MILLISECONDS,
    endMilliseconds:   BATON_PASS_TIMELINE.HAPPY_ENDS_MILLISECONDS,
  });
}

/** The return: bright and glowing, both fading in a straight line, with one hop; the catch squashes the body for a moment. */
function returnPartOf(elapsedMilliseconds: number): Pick<PosePart, 'body' | 'sleep'> {
  if (elapsedMilliseconds < BATON_PASS_TIMELINE.RETURN_MILLISECONDS) return {};
  const afterglow = 1 - progressBetween(elapsedMilliseconds, BATON_PASS_TIMELINE.RETURN_MILLISECONDS, BATON_PASS_TIMELINE.AFTERGLOW_ENDS_MILLISECONDS);
  const hop = progressBetween(elapsedMilliseconds, BATON_PASS_TIMELINE.RETURN_MILLISECONDS, BATON_PASS_TIMELINE.RETURN_MILLISECONDS + BATON_PASS_TIMELINE.HOP_MILLISECONDS);
  const isSquashed = isBetween(elapsedMilliseconds, BATON_PASS_TIMELINE.CATCH_MILLISECONDS, BATON_PASS_TIMELINE.CATCH_MILLISECONDS + BATON_PASS_TIMELINE.SQUASH_MILLISECONDS);
  return {
    body: {
      tint:      { role: 'emberLight', amount: BATON_PASS_MOTION.RETURN_TINT_AMOUNT * afterglow },
      addedLift: hop < 1 ? BATON_PASS_MOTION.HOP_UNITS * Math.sin(Math.PI * hop) : 0,
      ...(isSquashed ? { widthFactor: BATON_PASS_MOTION.CATCH_WIDTH_FACTOR, heightFactor: BATON_PASS_MOTION.CATCH_HEIGHT_FACTOR } : {}),
    },
    ...(afterglow > 0 ? { sleep: { glowOpacity: BATON_PASS_MOTION.RETURN_GLOW_OPACITY * afterglow } } : {}),
  };
}

function batonPassPartOf(input: GestureInput): PosePart {
  const elapsed = input.elapsedMilliseconds;
  const fillOpacity = fillOpacityAt(elapsed);
  const isGlowing = isBetween(elapsed, BATON_PASS_TIMELINE.RETURN_MILLISECONDS, BATON_PASS_TIMELINE.AFTERGLOW_ENDS_MILLISECONDS);
  const isHolding = elapsed < BATON_PASS_TIMELINE.TOSS_STARTS_MILLISECONDS
    || isBetween(elapsed, BATON_PASS_TIMELINE.HAND_RETURNS_MILLISECONDS, BATON_PASS_TIMELINE.HAPPY_ENDS_MILLISECONDS);
  const isHappy = isBetween(elapsed, BATON_PASS_TIMELINE.CATCH_MILLISECONDS, BATON_PASS_TIMELINE.HAPPY_ENDS_MILLISECONDS);
  const returned = returnPartOf(elapsed);
  const exactFields: ExactField[] = [...(fillOpacity === null ? [] : ['fill-opacity' as const]), ...(isGlowing ? ['tint' as const] : [])];
  return {
    ...returned,
    body:     { ...returned.body, ...(fillOpacity === null ? {} : { fillOpacity }) },
    eyes:     eyesAt(elapsed),
    nearHand: isHolding ? BATON_HAND : null,
    farHand:  null,
    props:    { baton: batonAt(elapsed) },
    ...(isHappy ? { emoteMark: glintsAt(elapsed) } : {}),
    exactFields,
  };
}

export const BATON_PASS_GESTURE = gestureDefinition({
  name:                  'baton-pass',
  intents:               { 'baton-pass': singleFormOf(BATON_PASS_TIMELINE.DURATION_MILLISECONDS, BATON_PASS_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            batonPassPartOf,
});
