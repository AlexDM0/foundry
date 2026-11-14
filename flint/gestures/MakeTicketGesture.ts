/**
 * Implements `02-animations.md`, "Gestures", "Make a ticket": write three lines, stamp the seal, file the ticket, in one cycle; and
 * "Reading and writing direction", "Ticket and notes". One hand: the pen while Flint writes, then the stamp, which shrinks the pen first.
 */
import type { HandPose, PosePart }                   from '../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }                     from '../constants/BodyShape.ts';
import { FILED_TICKET, MAKE_TICKET_TIMELINE, STAMP } from '../constants/MakeTicketMotion.ts';
import { TICKET_SHAPE }                              from '../constants/PropShapes.ts';
import type { GestureDefinition, GestureInput }      from './GestureDefinition.ts';
import { GestureTimelineUtil }                       from './GestureTimelineUtil.ts';
import type { WritingPaper }                         from './PenWritingUtil.ts';
import { PenWritingUtil }                            from './PenWritingUtil.ts';

const TICKET_PAPER: WritingPaper = Object.freeze({
  lineStartX:       TICKET_SHAPE.LINE_START_X_UNITS,
  lineYs:           TICKET_SHAPE.LINE_Y_UNITS,
  fullLineUnits:    TICKET_SHAPE.FULL_LINE_UNITS,
  lineMilliseconds: MAKE_TICKET_TIMELINE.LINE_MILLISECONDS,
});

/** The stamp rises above the seal, falls onto it, and from the seal on is placed exactly: it lands on the seal, then lifts. */
function stampOf(timeInCycle: number, isSealed: boolean): HandPose {
  const fallen = GestureTimelineUtil.progressBetween(timeInCycle, MAKE_TICKET_TIMELINE.STAMP_FALLS_MILLISECONDS, MAKE_TICKET_TIMELINE.SEALED_MILLISECONDS);
  const lifted = GestureTimelineUtil.progressBetween(timeInCycle, MAKE_TICKET_TIMELINE.JOLT_ENDS_MILLISECONDS, MAKE_TICKET_TIMELINE.STAMP_LIFT_ENDS_MILLISECONDS);
  const centreY = isSealed
    ? TICKET_SHAPE.SEAL_CENTRE_Y_UNITS - (STAMP.LIFT_UNITS * lifted)
    : STAMP.RAISED_Y_UNITS + ((TICKET_SHAPE.SEAL_CENTRE_Y_UNITS - STAMP.RAISED_Y_UNITS) * fallen);
  return {
    cornerCount: STAMP.CORNER_COUNT,
    centreX:     TICKET_SHAPE.SEAL_CENTRE_X_UNITS,
    centreY,
    radius:      STAMP.RADIUS_UNITS,
    turnDegrees: STAMP.TURN_DEGREES,
    placement:   isSealed ? 'exact-position' : 'eased',
  };
}

function makeTicketPartOf(input: GestureInput): PosePart {
  const { facing } = input;
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, MAKE_TICKET_TIMELINE.CYCLE_MILLISECONDS);
  const writing = PenWritingUtil.writingMomentOf(
    TICKET_PAPER, timeInCycle - MAKE_TICKET_TIMELINE.WRITING_STARTS_MILLISECONDS, input.elapsedMilliseconds, facing,
  );
  const isWriting = timeInCycle < MAKE_TICKET_TIMELINE.STAMP_RAISED_MILLISECONDS;
  const isSealed = timeInCycle >= MAKE_TICKET_TIMELINE.SEALED_MILLISECONDS;
  const isLeaving = timeInCycle >= MAKE_TICKET_TIMELINE.LEAVES_MILLISECONDS;
  const leaving = GestureTimelineUtil.progressBetween(timeInCycle, MAKE_TICKET_TIMELINE.LEAVES_MILLISECONDS, MAKE_TICKET_TIMELINE.CYCLE_MILLISECONDS);
  const isJolted = isSealed && timeInCycle < MAKE_TICKET_TIMELINE.JOLT_ENDS_MILLISECONDS;
  const ticket = {
    shown:          1,
    cycleOpacity:   Math.min(GestureTimelineUtil.progressBetween(timeInCycle, 0, MAKE_TICKET_TIMELINE.FADE_IN_MILLISECONDS), 1 - leaving),
    writtenLengths: writing.writtenLengths,
    sealShown:      isSealed,
    offsetX:        FILED_TICKET.LEAVE_X_UNITS * leaving,
    offsetY:        (isJolted ? FILED_TICKET.JOLT_UNITS : 0) + (FILED_TICKET.LEAVE_Y_UNITS * leaving),
  };
  const workingEyes = { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS };
  const eyes = isWriting
    ? { ...workingEyes, ...writing.eyes }
    : { ...workingEyes, ...(isSealed ? { happiness: 1 } : { height: STAMP.EYE_HEIGHT_UNITS }) };
  const stamp = isLeaving ? null : stampOf(timeInCycle, isSealed);
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes,
    nearHand: isWriting ? writing.pen : stamp,
    farHand:  null,
    props:    { ticket },
  };
}

export const MAKE_TICKET_GESTURE = Object.freeze<GestureDefinition>({
  name:                    'make-ticket',
  moods:                   ['normal'],
  durationMilliseconds:    null,
  continuesWhileWalking:   false,
  continuesWhileJumping:   false,
  stillMomentMilliseconds: MAKE_TICKET_TIMELINE.STILL_MOMENT_MILLISECONDS,
  verdict:                 null,
  targetPose:              makeTicketPartOf,
});
