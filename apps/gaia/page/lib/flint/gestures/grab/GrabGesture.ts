/**
 * Grab: two pentagons reach from the body centre to the target, as far as the reach allows,
 * and close on it. The catch is the `verdict`, taken once when the hands close; the mind turns Flint to the target before the grab.
 */
import type { Point }                      from '../../SpriteGeometry.ts';
import type { HandPose, PosePart }         from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                      from '../../constants/HandShape.ts';
import { AnimationCurveUtil }              from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GRAB_GESTURE_VALUES }             from './constants/GrabValues.ts';

const BODY_CENTRE: Point = Object.freeze({ x: 0, y: BODY_SHAPE.CENTRE_Y_UNITS });

/** With no target, Flint reaches straight ahead as far as it can. */
const TARGET_STRAIGHT_AHEAD: Point = Object.freeze({ x: GRAB_GESTURE_VALUES.REACH_UNITS, y: BODY_SHAPE.CENTRE_Y_UNITS });

function distanceFromBodyCentre(target: Point): number {
  return Math.max(GRAB_GESTURE_VALUES.MINIMUM_DISTANCE_UNITS, Math.hypot(target.x - BODY_CENTRE.x, target.y - BODY_CENTRE.y));
}

function targetIsWithinCatch(input: GestureInput): boolean {
  return input.target !== null && distanceFromBodyCentre(input.target) < GRAB_GESTURE_VALUES.CATCH_DISTANCE_UNITS;
}

function grabbingHand(centre: Point, radius: number): HandPose {
  return {
    cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT,
    centreX:     centre.x,
    centreY:     centre.y,
    radius,
    turnDegrees: GRAB_GESTURE_VALUES.HAND_TURN_DEGREES,
    placement:   'eased',
  };
}

function eyeHeightAfterCatch(verdict: boolean | null): PosePart['eyes'] {
  if (verdict === null) return {};
  return { height: verdict ? GRAB_GESTURE_VALUES.CAUGHT_EYE_HEIGHT_UNITS : GRAB_GESTURE_VALUES.MISSED_EYE_HEIGHT_UNITS };
}

function grabPartOf(input: GestureInput): PosePart {
  const target = input.target ?? TARGET_STRAIGHT_AHEAD;
  const distance = distanceFromBodyCentre(target);
  const reach = Math.min(distance, GRAB_GESTURE_VALUES.REACH_UNITS);
  const goal: Point = {
    x: BODY_CENTRE.x + (((target.x - BODY_CENTRE.x) / distance) * reach),
    y: BODY_CENTRE.y + (((target.y - BODY_CENTRE.y) / distance) * reach),
  };
  const spread = input.elapsedMilliseconds < GRAB_GESTURE_VALUES.CLOSE_MILLISECONDS ? GRAB_GESTURE_VALUES.OPEN_SPREAD_UNITS : GRAB_GESTURE_VALUES.CLOSED_SPREAD_UNITS;
  const spreadX = spread * GRAB_GESTURE_VALUES.SPREAD_DIRECTION_X;
  const spreadY = spread * GRAB_GESTURE_VALUES.SPREAD_DIRECTION_Y;
  const eyeLift = AnimationCurveUtil.clamp(
    (target.y - BODY_CENTRE.y) / GRAB_GESTURE_VALUES.EYE_LIFT_DIVISOR_UNITS,
    GRAB_GESTURE_VALUES.LOWEST_EYE_LIFT_UNITS,
    GRAB_GESTURE_VALUES.HIGHEST_EYE_LIFT_UNITS,
  );
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, lift: eyeLift, ...eyeHeightAfterCatch(input.verdict) },
    nearHand: grabbingHand({ x: goal.x + spreadX, y: goal.y + spreadY }, GRAB_GESTURE_VALUES.NEAR_HAND_RADIUS_UNITS),
    farHand:  grabbingHand({ x: goal.x - spreadX, y: goal.y - spreadY }, GRAB_GESTURE_VALUES.FAR_HAND_RADIUS_UNITS),
  };
}

export const GRAB_GESTURE = gestureDefinition({
  name:                  'grab',
  intents:               { grab: singleFormOf(GRAB_GESTURE_VALUES.DURATION_MILLISECONDS, GRAB_GESTURE_VALUES.CLOSE_MILLISECONDS) },
  continuesWhileWalking: true,
  continuesWhileJumping: false,
  aimsAtElement:         true,
  verdict:               { momentMilliseconds: GRAB_GESTURE_VALUES.CLOSE_MILLISECONDS, verdictOf: targetIsWithinCatch },
  targetPose:            grabPartOf,
});
