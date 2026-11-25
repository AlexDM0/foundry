/**
 * Wind-down: Flint types slowly, turns a dial down in three steps while its far hand types slower
 * and its eyes close a little more after each, then writes one last line on a small ticket and files it. The written line
 * grows from its left end on the screen, and the pen sits right of its end.
 */
import type { Facing, Point }                from '../../SpriteGeometry.ts';
import type { EyesPose, HandPose, PosePart } from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }             from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                        from '../../constants/HandShape.ts';
import { PAPER_SHAPE }                       from '../../props/shapes/constants/SharedShapes.ts';
import type { GestureInput }                 from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }   from '../GestureDefinition.ts';
import { GestureTimelineUtil }               from '../GestureTimelineUtil.ts';
import type { WritingPaper }                 from '../PenWritingUtil.ts';
import { PenWritingUtil }                    from '../PenWritingUtil.ts';
import { TypingUtil }                        from '../TypingUtil.ts';
import type { TypingHandSide }               from '../TypingUtil.ts';
import { PEN, WRITING_EYES }                 from '../constants/PenMotion.ts';
import { NORMAL_TYPING }                     from '../constants/TypingHands.ts';
import type { WindDownTicketState }          from './WindDownTicketProp.ts';
import {
  DIAL,
  DIAL_STEPS,
  LAST_TICKET,
  SLOW_TYPING,
  WIND_DOWN,
  WIND_DOWN_EXTENT,
} from './constants/WindDownValues.ts';

const { progressBetween } = GestureTimelineUtil;

const LAST_LINE_PAPER: WritingPaper = Object.freeze({
  lineStartX:       LAST_TICKET.LINE_START_X_UNITS,
  lineYs:           [LAST_TICKET.WRITTEN_LINE_Y_UNITS],
  fullLineUnits:    LAST_TICKET.FULL_LINE_UNITS,
  lineMilliseconds: LAST_TICKET.WRITING_MILLISECONDS,
});

const STEPS_END_MILLISECONDS = DIAL_STEPS.STARTS_MILLISECONDS + (DIAL_STEPS.STEP_MILLISECONDS * DIAL_STEPS.COUNT);

/** How far the dial has turned, in steps: a whole number while a step waits, a fraction while its turn runs. */
function stepsTurnedAt(elapsedMilliseconds: number): number {
  const sinceSteps = Math.min(elapsedMilliseconds, STEPS_END_MILLISECONDS) - DIAL_STEPS.STARTS_MILLISECONDS;
  if (sinceSteps <= 0) return 0;
  const stepIndex = Math.min(DIAL_STEPS.COUNT - 1, Math.floor(sinceSteps / DIAL_STEPS.STEP_MILLISECONDS));
  return stepIndex + progressBetween(sinceSteps - (stepIndex * DIAL_STEPS.STEP_MILLISECONDS), 0, DIAL_STEPS.TURN_MILLISECONDS);
}

/** The tap of one hand at the slow divisor given; a stopped hand rests on its key. */
function tapAt(side: TypingHandSide, elapsedMilliseconds: number, divisorMilliseconds: number | undefined): number {
  return divisorMilliseconds === undefined ? 0 : TypingUtil.alternatingTapOf(side, elapsedMilliseconds, NORMAL_TYPING.TAP_DEPTH_UNITS, divisorMilliseconds);
}

/** The far hand types slower after each step of the dial, and stops after the last. */
function farTypingHandAt(elapsedMilliseconds: number): HandPose {
  const finishedSteps = Math.floor(stepsTurnedAt(elapsedMilliseconds));
  return TypingUtil.handOnKeyOf('far', tapAt('far', elapsedMilliseconds, SLOW_TYPING.TAP_DIVISORS_MILLISECONDS[finishedSteps]));
}

function nearTypingHandAt(elapsedMilliseconds: number): HandPose {
  return TypingUtil.handOnKeyOf('near', tapAt('near', elapsedMilliseconds, SLOW_TYPING.TAP_DIVISORS_MILLISECONDS[0]));
}

/** The hexagon on the dial turns with the pointer. */
function dialHandAt(elapsedMilliseconds: number): HandPose {
  return {
    cornerCount: HAND_SHAPE.FASTENING_CORNER_COUNT,
    centreX:     DIAL.CENTRE_X_UNITS,
    centreY:     DIAL.CENTRE_Y_UNITS,
    radius:      DIAL_STEPS.HAND_RADIUS_UNITS,
    turnDegrees: DIAL_STEPS.STEP_DEGREES * stepsTurnedAt(elapsedMilliseconds),
    placement:   'eased',
  };
}

/** A point of the ticket's own units where it is drawn: at 80% around the paper's centre. */
function onSmallTicket(point: Point): Point {
  return {
    x: PAPER_SHAPE.CENTRE_X_UNITS + (LAST_TICKET.SCALE * (point.x - PAPER_SHAPE.CENTRE_X_UNITS)),
    y: PAPER_SHAPE.CENTRE_Y_UNITS + (LAST_TICKET.SCALE * (point.y - PAPER_SHAPE.CENTRE_Y_UNITS)),
  };
}

function writtenLengthAt(elapsedMilliseconds: number): number {
  return LAST_TICKET.FULL_LINE_UNITS * progressBetween(
    elapsedMilliseconds, LAST_TICKET.WRITING_STARTS_MILLISECONDS, LAST_TICKET.WRITING_STARTS_MILLISECONDS + LAST_TICKET.WRITING_MILLISECONDS,
  );
}

/** The pen right of the growing end of the line on the screen, by the rules of Make a ticket, at the ticket's scale. */
function penAt(elapsedMilliseconds: number, facing: Facing): HandPose {
  const end = onSmallTicket(PenWritingUtil.writtenEndOf(LAST_LINE_PAPER, LAST_TICKET.WRITTEN_LINE_Y_UNITS, writtenLengthAt(elapsedMilliseconds), facing));
  return {
    cornerCount: PEN.CORNER_COUNT,
    centreX:     end.x + (PEN.OFFSET_X_UNITS * facing),
    centreY:     end.y + PEN.OFFSET_Y_UNITS + (PEN.WOBBLE_UNITS * Math.sin(elapsedMilliseconds / PEN.WOBBLE_DIVISOR_MILLISECONDS)),
    radius:      PEN.RADIUS_UNITS,
    turnDegrees: PEN.TURN_DEGREES * facing,
    placement:   'eased',
  };
}

function ticketAt(elapsedMilliseconds: number): WindDownTicketState {
  const leaving = progressBetween(elapsedMilliseconds, LAST_TICKET.LEAVES_MILLISECONDS, WIND_DOWN.DURATION_MILLISECONDS);
  const arriving = progressBetween(elapsedMilliseconds, LAST_TICKET.FADE_IN_STARTS_MILLISECONDS, LAST_TICKET.FADE_IN_ENDS_MILLISECONDS);
  return {
    shown:         1,
    writtenLength: writtenLengthAt(elapsedMilliseconds),
    fade:          Math.min(arriving, 1 - leaving),
    offsetX:       LAST_TICKET.LEAVE_X_UNITS * leaving,
    offsetY:       LAST_TICKET.LEAVE_Y_UNITS * leaving,
  };
}

function dialAt(elapsedMilliseconds: number): NonNullable<PosePart['props']> {
  const fadingIn = progressBetween(elapsedMilliseconds, DIAL.FADE_IN_STARTS_MILLISECONDS, DIAL.FADE_IN_ENDS_MILLISECONDS);
  const fadingOut = progressBetween(elapsedMilliseconds, DIAL.FADE_OUT_STARTS_MILLISECONDS, DIAL.FADE_OUT_ENDS_MILLISECONDS);
  return {
    windDownDial: {
      shown:          1,
      pointerDegrees: DIAL.POINTER_START_DEGREES + (DIAL_STEPS.STEP_DEGREES * stepsTurnedAt(elapsedMilliseconds)),
      fade:           Math.min(fadingIn, 1 - fadingOut),
    },
  };
}

function dialEyesAt(elapsedMilliseconds: number): Partial<EyesPose> {
  const sinceSteps = elapsedMilliseconds - DIAL_STEPS.STARTS_MILLISECONDS;
  const stepIndex = Math.min(DIAL_STEPS.COUNT - 1, Math.max(0, Math.floor(sinceSteps / DIAL_STEPS.STEP_MILLISECONDS)));
  return { height: DIAL_STEPS.EYE_HEIGHTS_UNITS[stepIndex] ?? SLOW_TYPING.EYE_HEIGHT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS };
}

function windDownPartOf(input: GestureInput): PosePart {
  const { elapsedMilliseconds, facing } = input;
  const working = { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES };
  const keyboard = { keyboard: { shown: 1, drop: 0 } };
  if (elapsedMilliseconds < DIAL.FADE_IN_STARTS_MILLISECONDS) {
    return {
      body:     working,
      eyes:     { height: SLOW_TYPING.EYE_HEIGHT_UNITS, lift: SLOW_TYPING.EYE_LIFT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS },
      nearHand: nearTypingHandAt(elapsedMilliseconds),
      farHand:  farTypingHandAt(elapsedMilliseconds),
      props:    keyboard,
    };
  }
  if (elapsedMilliseconds < DIAL.FADE_OUT_STARTS_MILLISECONDS) {
    return {
      body: working,
      eyes: elapsedMilliseconds < DIAL_STEPS.STARTS_MILLISECONDS
        ? { height: SLOW_TYPING.EYE_HEIGHT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS }
        : dialEyesAt(elapsedMilliseconds),
      nearHand: dialHandAt(elapsedMilliseconds),
      farHand:  farTypingHandAt(elapsedMilliseconds),
      props:    { ...keyboard, ...dialAt(elapsedMilliseconds) },
    };
  }
  if (elapsedMilliseconds < LAST_TICKET.FADE_IN_STARTS_MILLISECONDS) {
    return {
      body: working, eyes: dialEyesAt(elapsedMilliseconds), nearHand: null, farHand: null, props: dialAt(elapsedMilliseconds),
    };
  }
  const isLeaving = elapsedMilliseconds >= LAST_TICKET.LEAVES_MILLISECONDS;
  const writtenLineY = onSmallTicket({ x: LAST_TICKET.LINE_START_X_UNITS, y: LAST_TICKET.WRITTEN_LINE_Y_UNITS }).y;
  return {
    body: working,
    eyes: isLeaving
      ? { height: LAST_TICKET.LEAVING_EYE_HEIGHT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS }
      : { height: WRITING_EYES.HEIGHT_UNITS, lift: (writtenLineY + WRITING_EYES.LIFT_OFFSET_UNITS) / WRITING_EYES.LIFT_DIVISOR, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS },
    nearHand: isLeaving ? null : penAt(elapsedMilliseconds, facing),
    farHand:  null,
    props:    { windDownTicket: ticketAt(elapsedMilliseconds) },
  };
}

export const WIND_DOWN_GESTURE = gestureDefinition({
  name:                  'wind-down',
  intents:               { 'wind-down': singleFormOf(WIND_DOWN.DURATION_MILLISECONDS, WIND_DOWN.STILL_MOMENT_MILLISECONDS, WIND_DOWN_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            windDownPartOf,
});
