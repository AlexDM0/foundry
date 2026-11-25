/**
 * Ribbon: two pentagons push three tickets of one epic together; a hexagon goes once around the
 * bundle while the ribbon grows; the bow springs in; then the bundle leaves.
 */
import type { HandPose, PosePart }         from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { ANGLE }                           from '../../constants/HandShape.ts';
import { SPRING }                          from '../../constants/Motion.ts';
import { AnimationCurveUtil }              from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import {
  RIBBON_EXTENT,
  RIBBON_EYES,
  RIBBON_HANDS,
  RIBBON_SHEETS,
  RIBBON_TIMELINE,
} from './constants/RibbonValues.ts';

/** The pentagons start this far out and come in with the outer sheets they push. */
const PUSH_TRAVEL_UNITS = (RIBBON_SHEETS.APART_X_UNITS.at(-1) ?? 0) - (RIBBON_SHEETS.TOGETHER_X_UNITS.at(-1) ?? 0);

function pushingHandOf(centreX: number, radius: number): HandPose {
  return {
    cornerCount: RIBBON_HANDS.PUSH_CORNER_COUNT,
    centreX,
    centreY:     RIBBON_HANDS.ELLIPSE_CENTRE_Y_UNITS,
    radius,
    turnDegrees: 0,
    placement:   'eased',
  };
}

/** Once around the ellipse from its near side, over the top first; smaller on the side by the body. */
function wrappingHandAt(wrapped: number): HandPose {
  const angle = -AnimationCurveUtil.radiansOf(ANGLE.FULL_TURN_DEGREES * wrapped);
  const towardsTheBody = Math.max(0, -Math.cos(angle));
  return {
    cornerCount: RIBBON_HANDS.WRAP_CORNER_COUNT,
    centreX:     RIBBON_HANDS.ELLIPSE_CENTRE_X_UNITS + (RIBBON_HANDS.ELLIPSE_RADIUS_X_UNITS * Math.cos(angle)),
    centreY:     RIBBON_HANDS.ELLIPSE_CENTRE_Y_UNITS + (RIBBON_HANDS.ELLIPSE_RADIUS_Y_UNITS * Math.sin(angle)),
    radius:      AnimationCurveUtil.interpolated(RIBBON_HANDS.WRAP_RADIUS_UNITS, RIBBON_HANDS.WRAP_BODY_SIDE_RADIUS_UNITS, towardsTheBody),
    turnDegrees: 0,
    placement:   'eased',
  };
}

function handsAt(timeInCycle: number, pushed: number, wrapped: number): Pick<PosePart, 'nearHand' | 'farHand'> {
  if (timeInCycle < RIBBON_TIMELINE.PUSH_STARTS_MILLISECONDS || timeInCycle >= RIBBON_TIMELINE.BOW_ENDS_MILLISECONDS) return { nearHand: null, farHand: null };
  if (timeInCycle < RIBBON_TIMELINE.PUSH_ENDS_MILLISECONDS) {
    const outward = PUSH_TRAVEL_UNITS * (1 - pushed);
    return {
      nearHand: pushingHandOf(RIBBON_HANDS.NEAR_PUSH_X_UNITS + outward, RIBBON_HANDS.NEAR_PUSH_RADIUS_UNITS),
      farHand:  pushingHandOf(RIBBON_HANDS.FAR_PUSH_X_UNITS - outward, RIBBON_HANDS.FAR_PUSH_RADIUS_UNITS),
    };
  }
  return { nearHand: wrappingHandAt(wrapped), farHand: null };
}

function ribbonPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, RIBBON_TIMELINE.CYCLE_MILLISECONDS);
  const { progressBetween } = GestureTimelineUtil;
  const pushed = progressBetween(timeInCycle, RIBBON_TIMELINE.PUSH_STARTS_MILLISECONDS, RIBBON_TIMELINE.PUSH_ENDS_MILLISECONDS);
  const wrapped = progressBetween(timeInCycle, RIBBON_TIMELINE.PUSH_ENDS_MILLISECONDS, RIBBON_TIMELINE.WRAP_ENDS_MILLISECONDS);
  const leaving = progressBetween(timeInCycle, RIBBON_TIMELINE.LEAVES_MILLISECONDS, RIBBON_TIMELINE.LEAVE_ENDS_MILLISECONDS);
  const isHappy = timeInCycle >= RIBBON_TIMELINE.BOW_ENDS_MILLISECONDS && timeInCycle < RIBBON_TIMELINE.LEAVES_MILLISECONDS;
  return {
    body:  { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:  { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: RIBBON_EYES.HEIGHT_UNITS, ...(isHappy ? { happiness: 1 } : {}) },
    ...handsAt(timeInCycle, pushed, wrapped),
    props: {
      ribbonBundle: {
        shown:        1,
        cycleOpacity: Math.min(progressBetween(timeInCycle, 0, RIBBON_TIMELINE.FADE_IN_MILLISECONDS), 1 - leaving),
        gathered:     pushed,
        wrapped,
        bowScale:     AnimationCurveUtil.springScaleAt((timeInCycle - RIBBON_TIMELINE.WRAP_ENDS_MILLISECONDS) / SPRING.DURATION_MILLISECONDS),
        offsetX:      RIBBON_SHEETS.LEAVE_X_UNITS * leaving,
        offsetY:      RIBBON_SHEETS.LEAVE_Y_UNITS * leaving,
      },
    },
  };
}

export const RIBBON_GESTURE = gestureDefinition({
  name:                  'ribbon',
  intents:               { ribbon: singleFormOf(null, RIBBON_TIMELINE.STILL_MOMENT_MILLISECONDS, RIBBON_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            ribbonPartOf,
});
