/**
 * Ink the draft: the pen goes once around the outline of a draft, which then becomes a ready ticket
 * with its header, and the ticket leaves. The pen traces, it does not write, so it keeps its place right of its tip in Flint's own units
 * and is mirrored with Flint: on the edge nearest the body it is on the sheet, never between the sheet and the body.
 */
import type { Point }                      from '../../SpriteGeometry.ts';
import type { HandPose, PosePart }         from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { PAPER_SHAPE }                     from '../../props/shapes/constants/SharedShapes.ts';
import { AnimationCurveUtil }              from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import { PEN, WRITING_EYES }               from '../constants/PenMotion.ts';
import type { InkDraftSheetState }         from './InkDraftSheetProp.ts';
import {
  INK_DRAFT_EXTENT,
  INK_DRAFT_EYES,
  INK_DRAFT_SHEET,
  INK_DRAFT_SPARKS,
  INK_DRAFT_TIMELINE,
  INK_DRAFT_TRACE,
} from './constants/InkDraftValues.ts';

/** The start corner, each corner the pen has passed, and its tip, after going around the outline for this long. */
function tracedPointsAt(traceMilliseconds: number): readonly Point[] {
  const corners = PAPER_SHAPE.POINTS;
  const start = corners[0] ?? { x: PAPER_SHAPE.CENTRE_X_UNITS, y: PAPER_SHAPE.CENTRE_Y_UNITS };
  const points: Point[] = [start];
  let sideStartMilliseconds = 0;
  for (const [i, sideMilliseconds] of INK_DRAFT_TRACE.SIDE_MILLISECONDS.entries()) {
    const from = corners[i] ?? start;
    const to = corners[(i + 1) % corners.length] ?? start;
    const along = GestureTimelineUtil.progressBetween(traceMilliseconds, sideStartMilliseconds, sideStartMilliseconds + sideMilliseconds);
    if (along <= 0) break;
    points.push({ x: from.x + ((to.x - from.x) * along), y: from.y + ((to.y - from.y) * along) });
    sideStartMilliseconds += sideMilliseconds;
  }
  return points;
}

function penAt(tip: Point): HandPose {
  return {
    cornerCount: PEN.CORNER_COUNT,
    centreX:     tip.x + PEN.OFFSET_X_UNITS,
    centreY:     tip.y + PEN.OFFSET_Y_UNITS,
    radius:      PEN.RADIUS_UNITS,
    turnDegrees: PEN.TURN_DEGREES,
    placement:   'eased',
  };
}

function inkDraftPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, INK_DRAFT_TIMELINE.CYCLE_MILLISECONDS);
  const tracedPoints = tracedPointsAt(timeInCycle - INK_DRAFT_TIMELINE.TRACE_STARTS_MILLISECONDS);
  const tip = tracedPoints[tracedPoints.length - 1] ?? { x: PAPER_SHAPE.CENTRE_X_UNITS, y: PAPER_SHAPE.CENTRE_Y_UNITS };
  const isInked = timeInCycle >= INK_DRAFT_TIMELINE.INKED_MILLISECONDS;
  const isPopping = isInked && timeInCycle < INK_DRAFT_TIMELINE.POP_ENDS_MILLISECONDS;
  const isHappy = timeInCycle >= INK_DRAFT_TIMELINE.HAPPY_STARTS_MILLISECONDS && timeInCycle < INK_DRAFT_TIMELINE.LEAVES_MILLISECONDS;
  const sparksLandMilliseconds = INK_DRAFT_TIMELINE.INKED_MILLISECONDS + INK_DRAFT_SPARKS.FLIGHT_MILLISECONDS;
  const leaving = GestureTimelineUtil.progressBetween(timeInCycle, INK_DRAFT_TIMELINE.LEAVES_MILLISECONDS, INK_DRAFT_TIMELINE.CYCLE_MILLISECONDS);
  const sheet: InkDraftSheetState = {
    shown:         1,
    cycleOpacity:  Math.min(GestureTimelineUtil.progressBetween(timeInCycle, 0, INK_DRAFT_TIMELINE.FADE_IN_MILLISECONDS), 1 - leaving),
    tracedPoints,
    isInked,
    headerOpacity: GestureTimelineUtil.progressBetween(timeInCycle, INK_DRAFT_TIMELINE.INKED_MILLISECONDS, INK_DRAFT_TIMELINE.HEADER_SHOWN_MILLISECONDS),
    scale:         isPopping ? INK_DRAFT_SHEET.POP_SCALE : 1,
    sparkFlight:   GestureTimelineUtil.progressBetween(timeInCycle, INK_DRAFT_TIMELINE.INKED_MILLISECONDS, sparksLandMilliseconds),
    offsetX:       INK_DRAFT_SHEET.LEAVE_X_UNITS * leaving,
    offsetY:       INK_DRAFT_SHEET.LEAVE_Y_UNITS * leaving,
  };
  return {
    body: { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes: {
      shift:  EYE_SHAPE.SHIFT_AT_WORK_UNITS,
      height: WRITING_EYES.HEIGHT_UNITS,
      lift:   AnimationCurveUtil.clamp(
        (tip.y + WRITING_EYES.LIFT_OFFSET_UNITS) / WRITING_EYES.LIFT_DIVISOR,
        INK_DRAFT_EYES.LOWEST_LIFT_UNITS,
        INK_DRAFT_EYES.HIGHEST_LIFT_UNITS,
      ),
      ...(isHappy ? { happiness: 1 } : {}),
    },
    nearHand: timeInCycle < INK_DRAFT_TIMELINE.HAND_LEAVES_MILLISECONDS ? penAt(tip) : null,
    farHand:  null,
    props:    { inkDraftSheet: sheet },
  };
}

export const INK_DRAFT_GESTURE = gestureDefinition({
  name:                  'ink-draft',
  intents:               { 'ink-draft': singleFormOf(null, INK_DRAFT_TIMELINE.STILL_MOMENT_MILLISECONDS, INK_DRAFT_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            inkDraftPartOf,
});
