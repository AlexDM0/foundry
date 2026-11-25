/**
 * Regrouping: four dim sparks fade in; a triangle points at each in turn, and each live one lights up
 * with a spring while the dead one goes grey and Flint narrows its eyes; a square sweeps the dead spark down and away; the live sparks bob
 * and Flint is happy; the sparks fade.
 */
import type { HandPose, PosePart }                    from '../../SpritePose.ts';
import { BODY_SHAPE }                                 from '../../constants/BodyShape.ts';
import { ANGLE }                                      from '../../constants/HandShape.ts';
import { AnimationCurveUtil }                         from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }                          from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }            from '../GestureDefinition.ts';
import { GestureTimelineUtil }                        from '../GestureTimelineUtil.ts';
import type { RegroupSparkState, RegroupSparksState } from './RegroupSparksProp.ts';
import {
  REGROUP_EXTENT,
  REGROUP_EYES,
  REGROUP_HANDS,
  REGROUP_SPARKS,
  REGROUP_TIMELINE,
} from './constants/RegroupValues.ts';

const { progressBetween } = GestureTimelineUtil;

const SPARK_COUNT = REGROUP_SPARKS.PLACES.length;

/** When Flint starts pointing at spark n. */
function pointingStartOf(index: number): number {
  return REGROUP_TIMELINE.POINTING_STARTS_MILLISECONDS + (index * REGROUP_TIMELINE.POINTING_MILLISECONDS);
}

function sparkAt(timeInCycle: number, index: number): RegroupSparkState {
  const place = REGROUP_SPARKS.PLACES[index] ?? REGROUP_SPARKS.PLACES[0];
  const sinceSeen = timeInCycle - pointingStartOf(index);
  const change = progressBetween(sinceSeen, 0, REGROUP_TIMELINE.CHANGE_MILLISECONDS);
  const dim = { centreX: place.X_UNITS, dimOpacity: REGROUP_SPARKS.DIM_OPACITY * (1 - change) };
  if (index === REGROUP_SPARKS.DEAD_INDEX) {
    const swept = progressBetween(timeInCycle, REGROUP_TIMELINE.SWEEP_STARTS_MILLISECONDS, REGROUP_TIMELINE.SWEEP_ENDS_MILLISECONDS);
    return {
      ...dim,
      centreY:     place.Y_UNITS + (REGROUP_SPARKS.DEAD_FALL_UNITS * swept),
      liveOpacity: 0,
      liveScale:   0,
      deadOpacity: REGROUP_SPARKS.DEAD_OPACITY * change * (1 - swept),
    };
  }
  const isBobbing = timeInCycle >= REGROUP_TIMELINE.SWEEP_ENDS_MILLISECONDS;
  return {
    ...dim,
    centreY:     place.Y_UNITS + (isBobbing ? REGROUP_SPARKS.BOB_UNITS * Math.sin((timeInCycle / REGROUP_SPARKS.BOB_DIVISOR_MILLISECONDS) + index) : 0),
    liveOpacity: sinceSeen > 0 ? 1 : 0,
    liveScale:   AnimationCurveUtil.springScaleAt(sinceSeen / REGROUP_TIMELINE.CHANGE_MILLISECONDS),
    deadOpacity: 0,
  };
}

function sparksAt(timeInCycle: number): RegroupSparksState {
  const arriving = progressBetween(timeInCycle, 0, REGROUP_TIMELINE.FADE_IN_MILLISECONDS);
  const leaving = progressBetween(timeInCycle, REGROUP_TIMELINE.FADE_OUT_STARTS_MILLISECONDS, REGROUP_TIMELINE.CYCLE_MILLISECONDS);
  return {
    shown:        1,
    cycleOpacity: Math.min(arriving, 1 - leaving),
    sparks:       Array.from({ length: SPARK_COUNT }, (_unused, i) => sparkAt(timeInCycle, i)),
  };
}

/** The triangle stands on the line from the spark's pointed-from place to the spark, short of it, its corner along the line. */
function pointingHandAt(spark: RegroupSparkState, index: number): HandPose {
  const place = REGROUP_SPARKS.PLACES[index] ?? REGROUP_SPARKS.PLACES[0];
  const awayX = spark.centreX - place.POINTED_FROM_X_UNITS;
  const awayY = spark.centreY - place.POINTED_FROM_Y_UNITS;
  const distance = Math.hypot(awayX, awayY);
  return {
    cornerCount: REGROUP_HANDS.POINTING_CORNER_COUNT,
    centreX:     spark.centreX - (awayX / distance * REGROUP_HANDS.DISTANCE_FROM_SPARK_UNITS),
    centreY:     spark.centreY - (awayY / distance * REGROUP_HANDS.DISTANCE_FROM_SPARK_UNITS),
    radius:      REGROUP_HANDS.POINTING_RADIUS_UNITS,
    turnDegrees: (Math.atan2(awayY, awayX) * ANGLE.HALF_TURN_DEGREES / Math.PI) + REGROUP_HANDS.CORNER_UP_TURN_DEGREES,
    placement:   'eased',
  };
}

function sweepingHandAt(timeInCycle: number): HandPose {
  const swept = progressBetween(timeInCycle, REGROUP_TIMELINE.SWEEP_STARTS_MILLISECONDS, REGROUP_TIMELINE.SWEEP_ENDS_MILLISECONDS);
  return {
    cornerCount: REGROUP_HANDS.SWEEPING_CORNER_COUNT,
    centreX:     REGROUP_HANDS.SWEEP_START_X_UNITS + ((REGROUP_HANDS.SWEEP_END_X_UNITS - REGROUP_HANDS.SWEEP_START_X_UNITS) * swept),
    centreY:     REGROUP_HANDS.SWEEP_START_Y_UNITS + ((REGROUP_HANDS.SWEEP_END_Y_UNITS - REGROUP_HANDS.SWEEP_START_Y_UNITS) * swept),
    radius:      REGROUP_HANDS.SWEEPING_RADIUS_UNITS,
    turnDegrees: REGROUP_HANDS.SWEEPING_TURN_DEGREES,
    placement:   'eased',
  };
}

function eyeLiftAt(spark: RegroupSparkState): number {
  return AnimationCurveUtil.clamp(
    (spark.centreY - REGROUP_EYES.LIFT_CENTRE_Y_UNITS) / REGROUP_EYES.LIFT_DIVISOR_UNITS, REGROUP_EYES.LOWEST_LIFT_UNITS, REGROUP_EYES.HIGHEST_LIFT_UNITS,
  );
}

function handAndEyesAt(timeInCycle: number, sparks: RegroupSparksState): PosePart {
  const lean = { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES };
  if (timeInCycle < REGROUP_TIMELINE.POINTING_STARTS_MILLISECONDS) return { nearHand: null };
  if (timeInCycle < REGROUP_TIMELINE.SWEEP_STARTS_MILLISECONDS) {
    const index = Math.floor((timeInCycle - REGROUP_TIMELINE.POINTING_STARTS_MILLISECONDS) / REGROUP_TIMELINE.POINTING_MILLISECONDS);
    const spark = sparks.sparks[index] ?? sparkAt(timeInCycle, index);
    return {
      body:     lean,
      eyes:     { shift: REGROUP_EYES.SHIFT_UNITS, lift: eyeLiftAt(spark), ...(index === REGROUP_SPARKS.DEAD_INDEX ? { height: REGROUP_EYES.DEAD_HEIGHT_UNITS } : {}) },
      nearHand: pointingHandAt(spark, index),
    };
  }
  if (timeInCycle < REGROUP_TIMELINE.SWEEP_ENDS_MILLISECONDS) {
    const deadSpark = sparks.sparks[REGROUP_SPARKS.DEAD_INDEX] ?? sparkAt(timeInCycle, REGROUP_SPARKS.DEAD_INDEX);
    return { body: lean, eyes: { shift: REGROUP_EYES.SHIFT_UNITS, lift: eyeLiftAt(deadSpark) }, nearHand: sweepingHandAt(timeInCycle) };
  }
  return {
    nearHand: null,
    ...(timeInCycle < REGROUP_TIMELINE.FADE_OUT_STARTS_MILLISECONDS ? { eyes: { happiness: 1 } } : {}),
  };
}

function regroupPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, REGROUP_TIMELINE.CYCLE_MILLISECONDS);
  const sparks = sparksAt(timeInCycle);
  return {
    ...handAndEyesAt(timeInCycle, sparks),
    farHand: null,
    props:   { regroupSparks: sparks },
  };
}

export const REGROUP_GESTURE = gestureDefinition({
  name:                  'regroup',
  intents:               { regroup: singleFormOf(null, REGROUP_TIMELINE.STILL_MOMENT_MILLISECONDS, REGROUP_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            regroupPartOf,
});
