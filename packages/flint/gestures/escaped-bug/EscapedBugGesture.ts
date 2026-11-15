/**
 * Implements `06-more-animations.md`, "Escaped bug": a landed block rocks, a bug escapes from it, and Flint chases it with one pentagon.
 * Two hits miss and the third has the bug; each hit falls onto its point and rests there, placed exactly. Then the hand lifts the bug and
 * a dashed crimson line traces it back to its block.
 */
import type { Point } from '../../SpriteGeometry.ts';
import type {
  EmoteMarkPose,
  EyesPose,
  HandPose,
  PosePart,
} from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                      from '../../constants/HandShape.ts';
import { EMOTE_HOP }                       from '../../emotes/constants/EmoteMotion.ts';
import { BugShapeUtil }                    from '../../props/shapes/BugShapeUtil.ts';
import { AnimationCurveUtil }              from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureMarkUtil }                 from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import type { EscapedBugState }            from './EscapedBugProp.ts';
import {
  ESCAPED_BUG_EYES,
  ESCAPED_BUG_HAND,
  ESCAPED_BUG_HITS,
  ESCAPED_BUG_LIFT_WAYPOINTS,
  ESCAPED_BUG_ROCK,
  ESCAPED_BUG_ROUTE,
  ESCAPED_BUG_SHAPE,
  ESCAPED_BUG_TIMELINE,
} from './constants/EscapedBugValues.ts';

const { progressBetween } = GestureTimelineUtil;

/** The bug's whole way: its run, then the lift around the block to its lifted place. */
const BUG_ROUTE = [
  ...ESCAPED_BUG_ROUTE,
  ...ESCAPED_BUG_LIFT_WAYPOINTS,
  { X_UNITS: ESCAPED_BUG_SHAPE.LIFTED_BUG_X_UNITS, Y_UNITS: ESCAPED_BUG_SHAPE.LIFTED_BUG_Y_UNITS, AT_MILLISECONDS: ESCAPED_BUG_TIMELINE.LIFTED_MILLISECONDS },
];

/** The bug on its way: in straight lines from each point to the next; before the escape it is at the first point, once lifted at the last. */
function bugOnRouteAt(timeInCycle: number): Point {
  for (let i = 1; i < BUG_ROUTE.length; i++) {
    const from = BUG_ROUTE[i - 1];
    const to = BUG_ROUTE[i];
    if (from !== undefined && to !== undefined && timeInCycle < to.AT_MILLISECONDS) {
      const leg = progressBetween(timeInCycle, from.AT_MILLISECONDS, to.AT_MILLISECONDS);
      return AnimationCurveUtil.interpolatedPoint({ x: from.X_UNITS, y: from.Y_UNITS }, { x: to.X_UNITS, y: to.Y_UNITS }, leg);
    }
  }
  return { x: ESCAPED_BUG_SHAPE.LIFTED_BUG_X_UNITS, y: ESCAPED_BUG_SHAPE.LIFTED_BUG_Y_UNITS };
}

function escapedBugStateAt(timeInCycle: number, elapsedMilliseconds: number): EscapedBugState {
  const sceneOpacity = Math.min(
    progressBetween(timeInCycle, 0, ESCAPED_BUG_TIMELINE.FADE_IN_MILLISECONDS),
    1 - progressBetween(timeInCycle, ESCAPED_BUG_TIMELINE.FADES_OUT_MILLISECONDS, ESCAPED_BUG_TIMELINE.CYCLE_MILLISECONDS),
  );
  const rocking = progressBetween(timeInCycle, ESCAPED_BUG_TIMELINE.ROCK_STARTS_MILLISECONDS, ESCAPED_BUG_TIMELINE.ESCAPES_MILLISECONDS);
  const bug = bugOnRouteAt(timeInCycle);
  const lifting = progressBetween(timeInCycle, ESCAPED_BUG_TIMELINE.CAUGHT_MILLISECONDS, ESCAPED_BUG_TIMELINE.LIFTED_MILLISECONDS);
  return {
    shown:            1,
    sceneOpacity,
    blockTurnDegrees: ESCAPED_BUG_ROCK.ROCK_DEGREES * Math.sin(ESCAPED_BUG_ROCK.ROCK_CYCLES * 2 * Math.PI * rocking),
    bugX:             bug.x,
    bugY:             bug.y,
    bugTurnDegrees:   BugShapeUtil.wiggleDegreesAt(elapsedMilliseconds),
    bugOpacity:       timeInCycle >= ESCAPED_BUG_TIMELINE.ESCAPES_MILLISECONDS ? sceneOpacity : 0,
    traceOpacity:     timeInCycle >= ESCAPED_BUG_TIMELINE.LIFTED_MILLISECONDS ? sceneOpacity : 0,
    bugBelowHand:     ESCAPED_BUG_HAND.CAUGHT_BUG_BELOW_HAND_UNITS
      + ((ESCAPED_BUG_HAND.LIFTED_BUG_BELOW_HAND_UNITS - ESCAPED_BUG_HAND.CAUGHT_BUG_BELOW_HAND_UNITS) * lifting),
  };
}

/** Before each hit the hand waits above its point; it falls onto the point and rests there, placed exactly; from the catch it holds the bug. */
function handAt(timeInCycle: number): HandPose | null {
  if (timeInCycle < ESCAPED_BUG_TIMELINE.HAND_APPEARS_MILLISECONDS || timeInCycle >= ESCAPED_BUG_TIMELINE.FADES_OUT_MILLISECONDS) return null;
  const pentagon = { cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT, radius: ESCAPED_BUG_HAND.RADIUS_UNITS, turnDegrees: 0 } as const;
  if (timeInCycle >= ESCAPED_BUG_TIMELINE.CAUGHT_MILLISECONDS) return {
    ...pentagon, centreX: 0, centreY: 0, placement: { heldTo: 'escapedBug' }
  };
  for (const hit of ESCAPED_BUG_HITS) {
    const raisedY = hit.Y_UNITS - ESCAPED_BUG_HAND.RAISE_UNITS;
    const slamStarts = hit.AT_MILLISECONDS - ESCAPED_BUG_HAND.SLAM_MILLISECONDS;
    if (timeInCycle < slamStarts) return {
      ...pentagon, centreX: hit.X_UNITS, centreY: raisedY, placement: 'eased'
    };
    if (timeInCycle < hit.AT_MILLISECONDS + ESCAPED_BUG_HAND.REST_MILLISECONDS) {
      const slam = progressBetween(timeInCycle, slamStarts, hit.AT_MILLISECONDS);
      return {
        ...pentagon, centreX: hit.X_UNITS, centreY: raisedY + (ESCAPED_BUG_HAND.RAISE_UNITS * slam), placement: 'exact-position'
      };
    }
  }
  return null;
}

/** The "!" of the escape. */
function exclamationAt(timeInCycle: number): EmoteMarkPose | null {
  return GestureMarkUtil.springingMarkIn('exclamation', timeInCycle, {
    startMilliseconds: ESCAPED_BUG_TIMELINE.ESCAPES_MILLISECONDS,
    endMilliseconds:   ESCAPED_BUG_TIMELINE.ESCAPES_MILLISECONDS + ESCAPED_BUG_TIMELINE.EXCLAMATION_MILLISECONDS,
  });
}

function eyesAt(timeInCycle: number, bug: EscapedBugState): Partial<EyesPose> {
  if (timeInCycle < ESCAPED_BUG_TIMELINE.ESCAPES_MILLISECONDS) return { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: ESCAPED_BUG_EYES.HOLD_HEIGHT_UNITS };
  if (timeInCycle >= ESCAPED_BUG_TIMELINE.CAUGHT_MILLISECONDS) {
    const isTracing = timeInCycle >= ESCAPED_BUG_TIMELINE.LIFTED_MILLISECONDS && timeInCycle < ESCAPED_BUG_TIMELINE.FADES_OUT_MILLISECONDS;
    return { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: ESCAPED_BUG_EYES.HOLD_HEIGHT_UNITS, slantDegrees: isTracing ? ESCAPED_BUG_EYES.TRACE_SLANT_DEGREES : 0, };
  }
  const isSurprised = timeInCycle < ESCAPED_BUG_TIMELINE.SURPRISE_ENDS_MILLISECONDS;
  return {
    shift:        ESCAPED_BUG_EYES.SHIFT_BASE_UNITS + ((bug.bugX - ESCAPED_BUG_EYES.SHIFT_ORIGIN_X_UNITS) / ESCAPED_BUG_EYES.SHIFT_DIVISOR_UNITS),
    height:       isSurprised ? ESCAPED_BUG_EYES.SURPRISED_HEIGHT_UNITS : ESCAPED_BUG_EYES.CHASE_HEIGHT_UNITS,
    slantDegrees: isSurprised ? 0 : ESCAPED_BUG_EYES.CHASE_SLANT_DEGREES,
  };
}

function escapedBugPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, ESCAPED_BUG_TIMELINE.CYCLE_MILLISECONDS);
  const escapedBug = escapedBugStateAt(timeInCycle, input.elapsedMilliseconds);
  const sinceEscape = timeInCycle - ESCAPED_BUG_TIMELINE.ESCAPES_MILLISECONDS;
  const isHopping = sinceEscape >= 0 && sinceEscape < EMOTE_HOP.MILLISECONDS;
  const exclamation = exclamationAt(timeInCycle);
  return {
    body: {
      leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES,
      ...(isHopping ? { addedLift: EMOTE_HOP.HEIGHT_UNITS * Math.sin((Math.PI * sinceEscape) / EMOTE_HOP.MILLISECONDS) } : {}),
    },
    eyes:     eyesAt(timeInCycle, escapedBug),
    nearHand: handAt(timeInCycle),
    farHand:  null,
    props:    { escapedBug },
    ...(exclamation === null ? {} : { emoteMark: exclamation }),
  };
}

export const ESCAPED_BUG_GESTURE = gestureDefinition({
  name:                  'escaped-bug',
  intents:               { 'escaped-bug': singleFormOf(null, ESCAPED_BUG_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            escapedBugPartOf,
});
