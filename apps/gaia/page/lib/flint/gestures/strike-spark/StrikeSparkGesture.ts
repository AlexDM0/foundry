/**
 * Strike a spark: the launch of a job. One square rises and strikes down along the edge of the body;
 * small sparks fly, the inner glow flares, and the spark of the new Watcher flies on an arc to its place, floats, and fades.
 */
import type { HandPose, PosePart }         from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                      from '../../constants/HandShape.ts';
import { SPRING }                          from '../../constants/Motion.ts';
import { SparkShapeUtil }                  from '../../props/shapes/SparkShapeUtil.ts';
import type { SmallSparkPlace }            from '../../props/shapes/SparkShapeUtil.ts';
import { AnimationCurveUtil }              from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import type { StruckSparksState }          from './StruckSparksProp.ts';
import {
  STRIKE_BODY,
  STRIKE_HAND,
  STRIKE_SPARK_EXTENT,
  STRIKE_SPARK_TIMELINE,
  STRUCK_SMALL_SPARKS,
  STRUCK_WATCHER,
} from './constants/StrikeSparkValues.ts';

const { progressBetween } = GestureTimelineUtil;
const { interpolated } = AnimationCurveUtil;


/** The square rises in its wind-up, strikes in a straight line set exactly on each frame, and stays struck until it goes away. */
function strikingHandOf(elapsedMilliseconds: number): HandPose | null {
  if (elapsedMilliseconds >= STRIKE_SPARK_TIMELINE.WATCHER_ARRIVES_MILLISECONDS) return null;
  const isStriking = elapsedMilliseconds >= STRIKE_SPARK_TIMELINE.STRIKE_STARTS_MILLISECONDS;
  const windUp = progressBetween(elapsedMilliseconds, 0, STRIKE_SPARK_TIMELINE.STRIKE_STARTS_MILLISECONDS);
  const strike = progressBetween(elapsedMilliseconds, STRIKE_SPARK_TIMELINE.STRIKE_STARTS_MILLISECONDS, STRIKE_SPARK_TIMELINE.STRUCK_MILLISECONDS);
  return {
    cornerCount: HAND_SHAPE.TYPING_CORNER_COUNT,
    centreX:     isStriking
      ? interpolated(STRIKE_HAND.RAISED_X_UNITS, STRIKE_HAND.STRUCK_X_UNITS, strike)
      : interpolated(STRIKE_HAND.START_X_UNITS, STRIKE_HAND.RAISED_X_UNITS, windUp),
    centreY: isStriking
      ? interpolated(STRIKE_HAND.RAISED_Y_UNITS, STRIKE_HAND.STRUCK_Y_UNITS, strike)
      : interpolated(STRIKE_HAND.START_Y_UNITS, STRIKE_HAND.RAISED_Y_UNITS, windUp),
    radius:      STRIKE_HAND.RADIUS_UNITS,
    turnDegrees: STRIKE_HAND.TURN_DEGREES,
    placement:   isStriking ? 'exact-position' : 'eased',
  };
}

/** Spark n flies straight out at its own angle; before the strike and after its flight it is not seen. */
function smallSparksAt(elapsedMilliseconds: number): SmallSparkPlace[] {
  const flight = (elapsedMilliseconds - STRIKE_SPARK_TIMELINE.STRUCK_MILLISECONDS) / STRIKE_SPARK_TIMELINE.SMALL_SPARK_FLIGHT_MILLISECONDS;
  return Array.from({ length: STRUCK_SMALL_SPARKS.COUNT }, (_unused, i) => SparkShapeUtil.flyingSparkPlaceOf({
    origin:       { x: STRUCK_SMALL_SPARKS.ORIGIN_X_UNITS, y: STRUCK_SMALL_SPARKS.ORIGIN_Y_UNITS },
    angleDegrees: STRUCK_SMALL_SPARKS.FIRST_ANGLE_DEGREES + (STRUCK_SMALL_SPARKS.ANGLE_STEP_DEGREES * i),
    travelUnits:  STRUCK_SMALL_SPARKS.TRAVEL_UNITS,
    flight,
  }));
}

/** The Watcher's centre: on its arc until it arrives, then floating at its place. */
function watcherCentreAt(elapsedMilliseconds: number): { readonly x: number; readonly y: number } {
  const flight = progressBetween(elapsedMilliseconds, STRIKE_SPARK_TIMELINE.STRUCK_MILLISECONDS, STRIKE_SPARK_TIMELINE.WATCHER_ARRIVES_MILLISECONDS);
  if (flight < 1) {
    const before = (1 - flight) * (1 - flight);
    const between = 2 * (1 - flight) * flight;
    const after = flight * flight;
    return {
      x: (before * STRUCK_WATCHER.START_X_UNITS) + (between * STRUCK_WATCHER.ARC_CONTROL_X_UNITS) + (after * STRUCK_WATCHER.PLACE_X_UNITS),
      y: (before * STRUCK_WATCHER.START_Y_UNITS) + (between * STRUCK_WATCHER.ARC_CONTROL_Y_UNITS) + (after * STRUCK_WATCHER.PLACE_Y_UNITS),
    };
  }
  const sinceArrival = elapsedMilliseconds - STRIKE_SPARK_TIMELINE.WATCHER_ARRIVES_MILLISECONDS;
  return {
    x: STRUCK_WATCHER.PLACE_X_UNITS,
    y: STRUCK_WATCHER.PLACE_Y_UNITS + (STRUCK_WATCHER.FLOAT_UNITS * Math.sin(sinceArrival / STRUCK_WATCHER.FLOAT_DIVISOR_MILLISECONDS)),
  };
}

function struckSparksAt(elapsedMilliseconds: number): StruckSparksState {
  const sinceStrike = elapsedMilliseconds - STRIKE_SPARK_TIMELINE.STRUCK_MILLISECONDS;
  const fadeStarts = STRIKE_SPARK_TIMELINE.DURATION_MILLISECONDS - STRIKE_SPARK_TIMELINE.WATCHER_FADE_MILLISECONDS;
  const watcher = watcherCentreAt(elapsedMilliseconds);
  return {
    shown:          1,
    watcherX:       watcher.x,
    watcherY:       watcher.y,
    watcherScale:   AnimationCurveUtil.springScaleAt(sinceStrike / SPRING.DURATION_MILLISECONDS),
    watcherOpacity: sinceStrike < 0 ? 0 : 1 - progressBetween(elapsedMilliseconds, fadeStarts, STRIKE_SPARK_TIMELINE.DURATION_MILLISECONDS),
    smallSparks:    smallSparksAt(elapsedMilliseconds),
  };
}

function strikeSparkPartOf(input: GestureInput): PosePart {
  const time = input.elapsedMilliseconds;
  const isStruck = time >= STRIKE_SPARK_TIMELINE.STRUCK_MILLISECONDS;
  const isSquashed = isStruck && time < STRIKE_SPARK_TIMELINE.STRUCK_MILLISECONDS + STRIKE_SPARK_TIMELINE.SQUASH_MILLISECONDS;
  const isHappy = time >= STRIKE_SPARK_TIMELINE.HAPPY_EYES_MILLISECONDS;
  const glowing = 1 - progressBetween(time, STRIKE_SPARK_TIMELINE.STRUCK_MILLISECONDS, STRIKE_SPARK_TIMELINE.GLOW_ENDS_MILLISECONDS);
  const isHandStruck = time < STRIKE_SPARK_TIMELINE.WATCHER_ARRIVES_MILLISECONDS;
  const followingEyes = {
    lift:   STRIKE_BODY.FOLLOW_EYE_LIFT_UNITS,
    shift:  isHandStruck ? EYE_SHAPE.SHIFT_AT_WORK_UNITS : STRIKE_BODY.FOLLOW_EYE_SHIFT_UNITS,
    height: STRIKE_BODY.STRUCK_EYE_HEIGHT_UNITS,
  };
  return {
    body: {
      leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES,
      ...(isSquashed ? { widthFactor: STRIKE_BODY.SQUASH_WIDTH_FACTOR, heightFactor: STRIKE_BODY.SQUASH_HEIGHT_FACTOR } : {}),
    },
    eyes: isStruck
      ? { ...followingEyes, ...(isHappy ? { happiness: 1 } : {}) }
      : { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: STRIKE_BODY.WIND_UP_EYE_HEIGHT_UNITS },
    nearHand: strikingHandOf(time),
    farHand:  null,
    sleep:    { glowOpacity: isStruck ? STRIKE_BODY.STRUCK_GLOW_OPACITY * glowing : 0 },
    props:    { struckSparks: struckSparksAt(time) },
  };
}

export const STRIKE_SPARK_GESTURE = gestureDefinition({
  name:                  'strike-spark',
  intents:               { 'strike-spark': singleFormOf(STRIKE_SPARK_TIMELINE.DURATION_MILLISECONDS, STRIKE_SPARK_TIMELINE.STILL_MOMENT_MILLISECONDS, STRIKE_SPARK_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            strikeSparkPartOf,
});
