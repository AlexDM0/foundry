/**
 * Implements `02-animations.md`, "Gestures", "Merge": two hexagon hands press two blocks into one, which snaps with sparks and a tick.
 * The happy eyes show on the frame of the snap, with no fade. The renderer mirrors the tick back, so the part is the same either facing.
 */
import type { PosePart, SparkPose }                  from '../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }                     from '../constants/BodyShape.ts';
import { MERGE_PRESS, MERGE_SPARKS, MERGE_TIMELINE } from '../constants/MergeMotion.ts';
import { MERGE_BLOCK_SHAPE }                         from '../constants/PropShapes.ts';
import { AnimationCurveUtil }                        from '../utils/AnimationCurveUtil.ts';
import type { GestureDefinition, GestureInput }      from './GestureDefinition.ts';
import { GestureTimelineUtil }                       from './GestureTimelineUtil.ts';

/** Each spark flies out on its own way and turns, fading over its flight; before the snap and after the flight it is not seen. */
function sparksAt(timeInCycle: number): SparkPose[] {
  const flight = (timeInCycle - MERGE_TIMELINE.SNAP_MILLISECONDS) / MERGE_TIMELINE.SPARKS_MILLISECONDS;
  const isFlying = flight > 0 && flight < 1;
  return MERGE_SPARKS.WAYS.map((way) => ({
    x:           MERGE_PRESS.CENTRE_X_UNITS + (way.X * (MERGE_SPARKS.START_X_UNITS + (MERGE_SPARKS.TRAVEL_X_UNITS * flight))),
    y:           MERGE_SPARKS.CENTRE_Y_UNITS + (way.Y * (MERGE_SPARKS.START_Y_UNITS + (MERGE_SPARKS.TRAVEL_Y_UNITS * flight))),
    turnDegrees: MERGE_SPARKS.TURN_DEGREES * flight,
    opacity:     isFlying ? 1 - flight : 0,
  }));
}

function mergePartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, MERGE_TIMELINE.CYCLE_MILLISECONDS);
  const press = GestureTimelineUtil.progressBetween(timeInCycle, MERGE_TIMELINE.PRESS_STARTS_MILLISECONDS, MERGE_TIMELINE.SNAP_MILLISECONDS);
  const pressed = press * press;
  const isSnapped = timeInCycle >= MERGE_TIMELINE.SNAP_MILLISECONDS;
  const isSquashed = isSnapped && timeInCycle < MERGE_TIMELINE.SQUASH_ENDS_MILLISECONDS;
  const leaving = GestureTimelineUtil.progressBetween(timeInCycle, MERGE_TIMELINE.LEAVES_MILLISECONDS, MERGE_TIMELINE.CYCLE_MILLISECONDS);
  const arriving = GestureTimelineUtil.progressBetween(timeInCycle, 0, MERGE_TIMELINE.FADE_IN_MILLISECONDS);
  const topBlockY = MERGE_BLOCK_SHAPE.TOP_BLOCK_Y_UNITS + (MERGE_PRESS.TRAVEL_UNITS * pressed);
  const bottomBlockY = MERGE_BLOCK_SHAPE.BOTTOM_BLOCK_Y_UNITS - (MERGE_PRESS.TRAVEL_UNITS * pressed);
  const release = isSnapped ? MERGE_PRESS.RELEASE_UNITS : 0;
  const mergedOpacity = isSnapped ? 1 - leaving : 0;
  const eyeWidening = AnimationCurveUtil.clamp((press - MERGE_PRESS.EYES_WIDEN_FROM_PRESS) / (1 - MERGE_PRESS.EYES_WIDEN_FROM_PRESS));
  return {
    body: {
      leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES,
      ...(isSquashed ? { widthFactor: MERGE_PRESS.SNAP_WIDTH_FACTOR, heightFactor: MERGE_PRESS.SNAP_HEIGHT_FACTOR } : {}),
    },
    eyes: {
      height: MERGE_PRESS.EYE_HEIGHT_UNITS + (MERGE_PRESS.EYE_WIDENING_UNITS * eyeWidening),
      lift:   MERGE_PRESS.EYE_LIFT_UNITS,
      shift:  EYE_SHAPE.SHIFT_AT_WORK_UNITS,
      ...(isSnapped ? { happiness: 1 } : {}),
    },
    nearHand: {
      cornerCount: MERGE_PRESS.HAND_CORNER_COUNT,
      centreX:     MERGE_PRESS.CENTRE_X_UNITS,
      centreY:     topBlockY - MERGE_PRESS.NEAR_HAND_ABOVE_BLOCK_UNITS - release,
      radius:      MERGE_PRESS.NEAR_HAND_RADIUS_UNITS,
      turnDegrees: 0,
      placement:   'eased',
    },
    farHand: {
      cornerCount: MERGE_PRESS.HAND_CORNER_COUNT,
      centreX:     MERGE_PRESS.CENTRE_X_UNITS,
      centreY:     bottomBlockY + MERGE_PRESS.FAR_HAND_BELOW_BLOCK_UNITS + release,
      radius:      MERGE_PRESS.FAR_HAND_RADIUS_UNITS,
      turnDegrees: 0,
      placement:   'eased',
    },
    props: {
      merge: {
        shown:         1,
        topBlockY,
        bottomBlockY,
        blocksOpacity: isSnapped ? 0 : arriving,
        mergedOpacity,
        mergedOffsetX: MERGE_PRESS.MERGED_LEAVE_X_UNITS * leaving,
        mergedOffsetY: MERGE_PRESS.MERGED_LEAVE_Y_UNITS * leaving,
        tickOpacity:   mergedOpacity,
        sparks:        sparksAt(timeInCycle),
      },
    },
    ...(isSnapped ? { exactFields: ['happy-eyes'] } : {}),
  };
}

export const MERGE_GESTURE = Object.freeze<GestureDefinition>({
  name:                    'merge',
  moods:                   ['normal'],
  durationMilliseconds:    null,
  continuesWhileWalking:   false,
  continuesWhileJumping:   false,
  stillMomentMilliseconds: MERGE_TIMELINE.STILL_MOMENT_MILLISECONDS,
  verdict:                 null,
  targetPose:              mergePartOf,
});
