/**
 * Bug jar: Flint reads the sheet of Review through its looking glass, finds a bug below the lens,
 * puts the glass away, catches the bug in a jar, and the jar becomes a low ticket. Reading goes from left to right on the screen whatever
 * the facing, so the bug shows where the lens stopped on the screen.
 */
import type { Facing, Point } from '../../SpriteGeometry.ts';
import type {
  EmoteMarkPose,
  EyesPose,
  HandPose,
  PosePart,
} from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                      from '../../constants/HandShape.ts';
import { BugShapeUtil }                    from '../../props/shapes/BugShapeUtil.ts';
import { AnimationCurveUtil }              from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureMarkUtil }                 from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import { ReadingLensUtil }                 from '../ReadingLensUtil.ts';
import { NORMAL_WORKING_VARIANT }          from '../constants/WorkingVariantValues.ts';
import type { BugJarState }                from './BugJarProp.ts';
import {
  BUG_JAR_BUG,
  BUG_JAR_EYES,
  BUG_JAR_READING,
  BUG_JAR_SHAPE,
  BUG_JAR_TICKET,
  BUG_JAR_TIMELINE,
} from './constants/BugJarValues.ts';

const { progressBetween } = GestureTimelineUtil;

/** Where the lens reads at one moment: the line, and how far across it on the screen from its left end. */
interface ReadingMoment {
  readonly lineIndex: number;
  readonly across:    number;
}

function readingMomentAt(timeInCycle: number, facing: Facing): ReadingMoment {
  const lineMilliseconds = BUG_JAR_READING.LINE_MILLISECONDS;
  const readingMilliseconds = (BUG_JAR_READING.STOP_LINE_INDEX + BUG_JAR_READING.LENS_STOPS_ALONG) * lineMilliseconds;
  const readingStarts = BUG_JAR_TIMELINE.FOUND_MILLISECONDS - readingMilliseconds;
  const timeRead = AnimationCurveUtil.clamp(timeInCycle - readingStarts, 0, readingMilliseconds);
  const lineIndex = Math.min(BUG_JAR_READING.STOP_LINE_INDEX, Math.floor(timeRead / lineMilliseconds));
  const along = Math.min(1, (timeRead / lineMilliseconds) - lineIndex);
  return { lineIndex, across: facing === 1 ? along : 1 - along };
}

function lensCentreOf(moment: ReadingMoment): Point {
  return ReadingLensUtil.lensCentreOf(moment.lineIndex, moment.across);
}


/** The bug circles once below the stopped lens, waits for the hand, is carried above the jar, and falls into it. */
function bugPlaceAt(timeInCycle: number, foundAt: Point): Point {
  const circling = progressBetween(timeInCycle, BUG_JAR_TIMELINE.FOUND_MILLISECONDS, BUG_JAR_TIMELINE.LENS_LEAVES_MILLISECONDS);
  const angle = 2 * Math.PI * circling;
  if (timeInCycle < BUG_JAR_TIMELINE.CAUGHT_MILLISECONDS) {
    return {
      x: foundAt.x + (BUG_JAR_BUG.CIRCLE_RADIUS_UNITS * (1 - Math.cos(angle))),
      y: foundAt.y + (BUG_JAR_BUG.CIRCLE_RADIUS_UNITS * Math.sin(angle)),
    };
  }
  const aboveJar = { x: BUG_JAR_BUG.ABOVE_JAR_X_UNITS, y: BUG_JAR_BUG.ABOVE_JAR_Y_UNITS };
  if (timeInCycle < BUG_JAR_TIMELINE.ABOVE_JAR_MILLISECONDS) {
    return AnimationCurveUtil.interpolatedPoint(foundAt, aboveJar, progressBetween(timeInCycle, BUG_JAR_TIMELINE.CAUGHT_MILLISECONDS, BUG_JAR_TIMELINE.ABOVE_JAR_MILLISECONDS));
  }
  const falling = progressBetween(timeInCycle, BUG_JAR_TIMELINE.ABOVE_JAR_MILLISECONDS, BUG_JAR_TIMELINE.LID_CLOSES_MILLISECONDS);
  return { x: aboveJar.x, y: aboveJar.y + ((BUG_JAR_BUG.IN_JAR_Y_UNITS - aboveJar.y) * falling * falling) };
}

/** The wiggle runs faster once the bug is caught; only the time after this cycle's catch runs faster, so the turn never jumps. */
function wiggleTimeAt(timeInCycle: number, elapsedMilliseconds: number): number {
  const sinceCatch = timeInCycle - BUG_JAR_TIMELINE.CAUGHT_MILLISECONDS;
  if (sinceCatch < 0) return elapsedMilliseconds;
  const caughtElapsed = elapsedMilliseconds - sinceCatch;
  return caughtElapsed + (BUG_JAR_BUG.CAUGHT_WIGGLE_FACTOR * sinceCatch);
}

function bugJarStateAt(timeInCycle: number, elapsedMilliseconds: number, foundAt: Point): BugJarState {
  const bug = bugPlaceAt(timeInCycle, foundAt);
  const isFiled = timeInCycle >= BUG_JAR_TIMELINE.TICKET_LEAVES_MILLISECONDS;
  const isFound = timeInCycle >= BUG_JAR_TIMELINE.FOUND_MILLISECONDS && !isFiled;
  const ticketArrives = progressBetween(timeInCycle, BUG_JAR_TIMELINE.JAR_SHRINKS_MILLISECONDS, BUG_JAR_TIMELINE.TICKET_LEAVES_MILLISECONDS);
  const ticketLeaves = progressBetween(timeInCycle, BUG_JAR_TIMELINE.TICKET_LEAVES_MILLISECONDS, BUG_JAR_TIMELINE.CYCLE_MILLISECONDS);
  const jarArrives = progressBetween(timeInCycle, BUG_JAR_TIMELINE.CAUGHT_MILLISECONDS, BUG_JAR_TIMELINE.CAUGHT_MILLISECONDS + BUG_JAR_TIMELINE.JAR_FADE_IN_MILLISECONDS);
  return {
    shown:          1,
    bugX:           bug.x,
    bugY:           bug.y,
    bugTurnDegrees: BugShapeUtil.wiggleDegreesAt(wiggleTimeAt(timeInCycle, elapsedMilliseconds)),
    bugOpacity:     isFound ? 1 : 0,
    jarOpacity:     isFiled ? 0 : jarArrives,
    jarScale:       1 - progressBetween(timeInCycle, BUG_JAR_TIMELINE.JAR_SHRINKS_MILLISECONDS, BUG_JAR_TIMELINE.TICKET_LEAVES_MILLISECONDS),
    lidLift:        timeInCycle < BUG_JAR_TIMELINE.LID_CLOSES_MILLISECONDS ? BUG_JAR_SHAPE.LID_OPEN_LIFT_UNITS : 0,
    ticketOpacity:  isFiled ? 1 - ticketLeaves : ticketArrives,
    ticketOffsetX:  BUG_JAR_TICKET.LEAVE_X_UNITS * ticketLeaves,
    ticketOffsetY:  BUG_JAR_TICKET.LEAVE_Y_UNITS * ticketLeaves,
  };
}

/** The pentagon holds the glass, shrinks away with it, comes back to the bug, carries it, and lets it fall into the jar. */
function handAt(timeInCycle: number, bugJar: BugJarState): HandPose | null {
  const pentagon = { cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT, radius: BUG_JAR_READING.HAND_RADIUS_UNITS, turnDegrees: 0 } as const;
  const leaving = progressBetween(timeInCycle, BUG_JAR_TIMELINE.LENS_LEAVES_MILLISECONDS, BUG_JAR_TIMELINE.CAUGHT_MILLISECONDS);
  const grip = { x: bugJar.bugX + BUG_JAR_BUG.GRIP_OFFSET_X_UNITS, y: bugJar.bugY + BUG_JAR_BUG.GRIP_OFFSET_Y_UNITS };
  const aboveJarGrip = { x: BUG_JAR_BUG.ABOVE_JAR_X_UNITS + BUG_JAR_BUG.GRIP_OFFSET_X_UNITS, y: BUG_JAR_BUG.ABOVE_JAR_Y_UNITS + BUG_JAR_BUG.GRIP_OFFSET_Y_UNITS };
  if (timeInCycle >= BUG_JAR_TIMELINE.LID_CLOSES_MILLISECONDS) return null;
  if (timeInCycle >= BUG_JAR_TIMELINE.ABOVE_JAR_MILLISECONDS) return {
    ...pentagon, centreX: aboveJarGrip.x, centreY: aboveJarGrip.y, placement: 'eased'
  };
  if (timeInCycle >= BUG_JAR_TIMELINE.CAUGHT_MILLISECONDS) return {
    ...pentagon, centreX: grip.x, centreY: grip.y, placement: { heldTo: 'bugJar' }
  };
  if (leaving >= 1 / 2) return {
    ...pentagon, centreX: grip.x, centreY: grip.y, placement: 'eased'
  };
  return {
    ...pentagon, radius: pentagon.radius * (1 - (2 * leaving)), centreX: 0, centreY: 0, placement: { heldTo: 'lookingGlass' },
  };
}

/** The "!" of the find, from the find until the lens has gone. */
function exclamationAt(timeInCycle: number): EmoteMarkPose | null {
  return GestureMarkUtil.springingMarkIn('exclamation', timeInCycle, {
    startMilliseconds: BUG_JAR_TIMELINE.FOUND_MILLISECONDS,
    endMilliseconds:   BUG_JAR_TIMELINE.EXCLAMATION_ENDS_MILLISECONDS,
  });
}

function eyesAt(timeInCycle: number, moment: ReadingMoment, bugJar: BugJarState): Partial<EyesPose> {
  const readingEyes = {
    height: NORMAL_WORKING_VARIANT.EYE_HEIGHT_UNITS,
    ...ReadingLensUtil.readingEyesOf(moment.lineIndex, moment.across),
  };
  if (timeInCycle < BUG_JAR_TIMELINE.FOUND_MILLISECONDS) return readingEyes;
  if (timeInCycle < BUG_JAR_TIMELINE.CAUGHT_MILLISECONDS) return { ...readingEyes, height: BUG_JAR_READING.FOUND_EYE_HEIGHT_UNITS };
  const followingEyes = {
    height: BUG_JAR_EYES.FOLLOW_HEIGHT_UNITS,
    shift:  EYE_SHAPE.SHIFT_AT_WORK_UNITS,
    lift:   AnimationCurveUtil.clamp(
      (bugJar.bugY - BUG_JAR_EYES.LIFT_CENTRE_Y_UNITS) / BUG_JAR_EYES.LIFT_DIVISOR_UNITS, BUG_JAR_EYES.LIFT_LOWEST_UNITS, BUG_JAR_EYES.LIFT_HIGHEST_UNITS,
    ),
  };
  return timeInCycle < BUG_JAR_TIMELINE.HAPPY_EYES_FROM_MILLISECONDS ? followingEyes : { ...followingEyes, happiness: 1 };
}

function bugJarPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, BUG_JAR_TIMELINE.CYCLE_MILLISECONDS);
  const moment = readingMomentAt(timeInCycle, input.facing);
  const lensStop = lensCentreOf(moment);
  const lensLeaves = progressBetween(timeInCycle, BUG_JAR_TIMELINE.LENS_LEAVES_MILLISECONDS, BUG_JAR_TIMELINE.CAUGHT_MILLISECONDS);
  const lens = AnimationCurveUtil.interpolatedPoint(lensStop, { x: BUG_JAR_READING.LENS_EXIT_X_UNITS, y: BUG_JAR_READING.LENS_EXIT_Y_UNITS }, lensLeaves);
  const bugJar = bugJarStateAt(timeInCycle, input.elapsedMilliseconds, { x: lensStop.x, y: lensStop.y + BUG_JAR_BUG.BELOW_LENS_UNITS });
  const isLensUp = timeInCycle < BUG_JAR_TIMELINE.LENS_LEAVES_MILLISECONDS;
  const exclamation = exclamationAt(timeInCycle);
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     eyesAt(timeInCycle, moment, bugJar),
    nearHand: handAt(timeInCycle, bugJar),
    farHand:  null,
    props:    {
      sheet: {
        shown:            1 - progressBetween(timeInCycle, BUG_JAR_TIMELINE.TICKET_LEAVES_MILLISECONDS, BUG_JAR_TIMELINE.CYCLE_MILLISECONDS),
        readLineIndex:    isLensUp ? moment.lineIndex : null,
        stackedPageCount: 0,
        offsetY:          0,
        verdict:          null,
      },
      lookingGlass: { shown: 1 - lensLeaves, centreX: lens.x, centreY: lens.y },
      bugJar,
    },
    ...(exclamation === null ? {} : { emoteMark: exclamation }),
  };
}

export const BUG_JAR_GESTURE = gestureDefinition({
  name:                  'bug-jar',
  intents:               { 'bug-jar': singleFormOf(null, BUG_JAR_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            bugJarPartOf,
});
