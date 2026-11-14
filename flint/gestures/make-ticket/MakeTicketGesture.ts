/**
 * Implements `02-animations.md`, "Gestures", "Make a ticket": write three lines, stamp the seal, file the ticket, in one cycle; and
 * "Reading and writing direction", "Ticket and notes". One hand: the pen while Flint writes, then the stamp, which shrinks the pen first.
 */
import type { PosePart }                   from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import type { WritingPaper }               from '../PenWritingUtil.ts';
import { PenWritingUtil }                  from '../PenWritingUtil.ts';
import { stampingHandAt }                  from '../StampingHand.ts';
import type { StampTimeline }              from '../StampingHand.ts';
import {
  FILED_TICKET,
  MAKE_TICKET_TIMELINE,
  STAMP,
  TICKET_SHAPE
} from './constants/MakeTicketValues.ts';

const TICKET_PAPER: WritingPaper = Object.freeze({
  lineStartX:       TICKET_SHAPE.LINE_START_X_UNITS,
  lineYs:           TICKET_SHAPE.LINE_Y_UNITS,
  fullLineUnits:    TICKET_SHAPE.FULL_LINE_UNITS,
  lineMilliseconds: MAKE_TICKET_TIMELINE.LINE_MILLISECONDS,
});

const SEAL = Object.freeze({ x: TICKET_SHAPE.SEAL_CENTRE_X_UNITS, y: TICKET_SHAPE.SEAL_CENTRE_Y_UNITS });

const STAMP_TIMELINE: StampTimeline = Object.freeze({
  fallStartsMilliseconds: MAKE_TICKET_TIMELINE.STAMP_FALLS_MILLISECONDS,
  sealedMilliseconds:     MAKE_TICKET_TIMELINE.SEALED_MILLISECONDS,
  joltEndsMilliseconds:   MAKE_TICKET_TIMELINE.JOLT_ENDS_MILLISECONDS,
  liftEndsMilliseconds:   MAKE_TICKET_TIMELINE.STAMP_LIFT_ENDS_MILLISECONDS,
});

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
  const stamp = isLeaving ? null : stampingHandAt(timeInCycle, SEAL, STAMP.RAISED_Y_UNITS, STAMP_TIMELINE);
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes,
    nearHand: isWriting ? writing.pen : stamp,
    farHand:  null,
    props:    { ticket },
  };
}

export const MAKE_TICKET_GESTURE = gestureDefinition({
  name:                  'make-ticket',
  intents:               { 'make-ticket': singleFormOf(null, MAKE_TICKET_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            makeTicketPartOf,
});
