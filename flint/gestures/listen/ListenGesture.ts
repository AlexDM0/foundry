/**
 * Implements `06-more-animations.md`, "Quiet job": a loop in which Flint leans in to listen at a dark block, taps it twice with a
 * triangle, then leans back and shows the question mark of the Doubt emote, with its spring at its start and its fade in its last 160 ms.
 */
import type { PosePart }                   from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                      from '../../constants/HandShape.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureMarkUtil }                 from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import { LISTEN_POSE, LISTEN_TIMELINE }    from './constants/ListenValues.ts';

/** How far the tap that runs is, from 0 to 1; null between taps. */
function tapProgressAt(timeInCycle: number): number | null {
  for (const tapStart of LISTEN_TIMELINE.TAP_STARTS_MILLISECONDS) {
    const sinceTap = timeInCycle - tapStart;
    if (sinceTap >= 0 && sinceTap < LISTEN_TIMELINE.TAP_MILLISECONDS) return sinceTap / LISTEN_TIMELINE.TAP_MILLISECONDS;
  }
  return null;
}

function doubtPartOf(timeInCycle: number): PosePart {
  return {
    body:      { leanDegrees: LISTEN_POSE.DOUBT_LEAN_DEGREES },
    eyes:      { height: EYE_SHAPE.HEIGHT_UNITS, rightHeightOverride: LISTEN_POSE.DOUBT_RIGHT_EYE_HEIGHT_UNITS, shift: LISTEN_POSE.EYE_SHIFT_UNITS },
    nearHand:  null,
    farHand:   null,
    emoteMark: GestureMarkUtil.springingMarkIn('question', timeInCycle, {
      startMilliseconds: LISTEN_TIMELINE.DOUBT_FROM_MILLISECONDS,
      endMilliseconds:   LISTEN_TIMELINE.CYCLE_MILLISECONDS,
    }),
  };
}

/** The tapper's place is set exactly, so each 100 ms dip goes its full 5 units into the block rather than a part of them. */
function listeningPartOf(timeInCycle: number, tapProgress: number | null): PosePart {
  const isTapping = timeInCycle >= LISTEN_TIMELINE.TAPS_FROM_MILLISECONDS;
  const tapDepth = tapProgress === null ? 0 : LISTEN_POSE.TAP_DEPTH_UNITS * Math.sin(Math.PI * tapProgress);
  return {
    body:     { leanDegrees: LISTEN_POSE.LEAN_DEGREES },
    eyes:     { height: LISTEN_POSE.EYE_HEIGHT_UNITS, rightHeightOverride: LISTEN_POSE.RIGHT_EYE_HEIGHT_UNITS, shift: LISTEN_POSE.EYE_SHIFT_UNITS },
    nearHand: isTapping
      ? {
        cornerCount: HAND_SHAPE.POINTING_CORNER_COUNT,
        centreX:     LISTEN_POSE.TAPPER_CENTRE_X_UNITS,
        centreY:     LISTEN_POSE.TAPPER_CENTRE_Y_UNITS + tapDepth,
        radius:      LISTEN_POSE.TAPPER_RADIUS_UNITS,
        turnDegrees: LISTEN_POSE.TAPPER_TURN_DEGREES,
        placement:   'exact-position',
      }
      : null,
    farHand: null,
  };
}

function arrivingPartOf(): PosePart {
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS },
    nearHand: null,
    farHand:  null,
  };
}

function listenPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, LISTEN_TIMELINE.CYCLE_MILLISECONDS);
  const tapProgress = tapProgressAt(timeInCycle);
  const block = {
    shown:   1,
    // The block fades in once, as the gesture starts: a fade in each cycle would make it blink between cycles.
    opacity: GestureTimelineUtil.progressBetween(input.elapsedMilliseconds, 0, LISTEN_TIMELINE.FADE_IN_MILLISECONDS),
    drop:    tapProgress === null ? 0 : LISTEN_POSE.BLOCK_TAP_DROP_UNITS,
  };
  let part: PosePart;
  if (timeInCycle >= LISTEN_TIMELINE.DOUBT_FROM_MILLISECONDS) part = doubtPartOf(timeInCycle);
  else if (timeInCycle >= LISTEN_TIMELINE.LISTENS_FROM_MILLISECONDS) part = listeningPartOf(timeInCycle, tapProgress);
  else part = arrivingPartOf();
  return { ...part, props: { listenBlock: block } };
}

export const LISTEN_GESTURE = gestureDefinition({
  name:                  'listen',
  intents:               { listen: singleFormOf(null, LISTEN_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            listenPartOf,
});
