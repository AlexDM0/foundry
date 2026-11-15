/**
 * Implements `06-more-animations.md`, "Playbook": one Pass of the Overseer. Flint looks behind and ahead, opens a small book, points down
 * its four lines, closes it with a hop, acts with the hand of Point, and lets the hand go.
 */
import type { HandPose, PosePart }         from '../../SpritePose.ts';
import { BODY_SHAPE }                      from '../../constants/BodyShape.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import { pointingHandAt }                  from '../PointingHand.ts';
import type { PlaybookBookState }          from './PlaybookBookProp.ts';
import {
  PLAYBOOK_BODY,
  PLAYBOOK_BOOK_SHAPE,
  PLAYBOOK_EYES,
  PLAYBOOK_HANDS,
  PLAYBOOK_TIMELINE,
} from './constants/PlaybookValues.ts';

const { progressBetween } = GestureTimelineUtil;

const LINE_COUNT = PLAYBOOK_BOOK_SHAPE.LINE_Y_UNITS.length;

/** The line read at this moment of the reading; the last line stays until the book closes. */
function lineIndexAt(timeInCycle: number): number {
  return Math.min(LINE_COUNT - 1, Math.floor((timeInCycle - PLAYBOOK_TIMELINE.READING_STARTS_MILLISECONDS) / PLAYBOOK_TIMELINE.LINE_MILLISECONDS));
}

function readingHandAt(lineIndex: number): HandPose {
  return {
    cornerCount: PLAYBOOK_HANDS.READING_CORNER_COUNT,
    centreX:     PLAYBOOK_HANDS.READING_CENTRE_X_UNITS,
    centreY:     PLAYBOOK_BOOK_SHAPE.LINE_Y_UNITS[lineIndex] ?? PLAYBOOK_BOOK_SHAPE.LINE_Y_UNITS[0],
    radius:      PLAYBOOK_HANDS.READING_RADIUS_UNITS,
    turnDegrees: PLAYBOOK_HANDS.READING_TURN_DEGREES,
    placement:   'eased',
  };
}

/** Closed until it opens, open while Flint reads, closed at once when the reading ends; it fades in before, and out while Flint acts. */
function bookAt(timeInCycle: number): PlaybookBookState {
  const isRead = timeInCycle >= PLAYBOOK_TIMELINE.READING_STARTS_MILLISECONDS && timeInCycle < PLAYBOOK_TIMELINE.READING_ENDS_MILLISECONDS;
  const isClosedAgain = timeInCycle >= PLAYBOOK_TIMELINE.READING_ENDS_MILLISECONDS;
  const arriving = progressBetween(timeInCycle, PLAYBOOK_TIMELINE.BOOK_ARRIVES_MILLISECONDS, PLAYBOOK_TIMELINE.BOOK_OPENS_MILLISECONDS);
  const leaving = progressBetween(timeInCycle, PLAYBOOK_TIMELINE.ACTING_STARTS_MILLISECONDS, PLAYBOOK_TIMELINE.HAND_LEAVES_MILLISECONDS);
  return {
    shown:         1,
    cycleOpacity:  Math.min(arriving, 1 - leaving),
    coverWidth:    isClosedAgain ? 1 : 1 - progressBetween(timeInCycle, PLAYBOOK_TIMELINE.BOOK_OPENS_MILLISECONDS, PLAYBOOK_TIMELINE.READING_STARTS_MILLISECONDS),
    readLineIndex: isRead ? lineIndexAt(timeInCycle) : null,
  };
}

function lookingPartOf(timeInCycle: number): PosePart {
  if (timeInCycle < PLAYBOOK_TIMELINE.LOOK_AHEAD_MILLISECONDS) {
    return { eyes: { shift: PLAYBOOK_EYES.LOOK_BEHIND_SHIFT_UNITS, height: PLAYBOOK_EYES.LOOK_BEHIND_HEIGHT_UNITS } };
  }
  if (timeInCycle < PLAYBOOK_TIMELINE.BOOK_ARRIVES_MILLISECONDS) return { eyes: { shift: PLAYBOOK_EYES.LOOK_AHEAD_SHIFT_UNITS } };
  return { eyes: { shift: PLAYBOOK_EYES.WORKING_SHIFT_UNITS } };
}

function workingPartOf(timeInCycle: number, elapsedMilliseconds: number): PosePart {
  const lean = { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES };
  if (timeInCycle < PLAYBOOK_TIMELINE.READING_ENDS_MILLISECONDS) {
    const lineIndex = lineIndexAt(timeInCycle);
    return {
      body: lean,
      eyes: {
        shift:  PLAYBOOK_EYES.WORKING_SHIFT_UNITS,
        height: PLAYBOOK_EYES.READING_HEIGHT_UNITS,
        lift:   PLAYBOOK_EYES.READING_FIRST_LIFT_UNITS + (PLAYBOOK_EYES.READING_LIFT_PER_LINE_UNITS * lineIndex),
      },
      nearHand: readingHandAt(lineIndex),
    };
  }
  if (timeInCycle < PLAYBOOK_TIMELINE.ACTING_STARTS_MILLISECONDS) {
    const hop = progressBetween(timeInCycle, PLAYBOOK_TIMELINE.READING_ENDS_MILLISECONDS, PLAYBOOK_TIMELINE.ACTING_STARTS_MILLISECONDS);
    return {
      body:     { ...lean, addedLift: PLAYBOOK_BODY.HOP_UNITS * Math.sin(Math.PI * hop) },
      eyes:     { shift: PLAYBOOK_EYES.WORKING_SHIFT_UNITS },
      nearHand: readingHandAt(LINE_COUNT - 1),
    };
  }
  return {
    body:     lean,
    eyes:     { shift: PLAYBOOK_EYES.WORKING_SHIFT_UNITS, height: PLAYBOOK_EYES.ACTING_HEIGHT_UNITS },
    nearHand: pointingHandAt(elapsedMilliseconds),
  };
}

function playbookPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, PLAYBOOK_TIMELINE.CYCLE_MILLISECONDS);
  const isWorking = timeInCycle >= PLAYBOOK_TIMELINE.READING_STARTS_MILLISECONDS && timeInCycle < PLAYBOOK_TIMELINE.HAND_LEAVES_MILLISECONDS;
  const part = isWorking ? workingPartOf(timeInCycle, input.elapsedMilliseconds) : { ...lookingPartOf(timeInCycle), nearHand: null };
  return {
    ...part,
    farHand: null,
    props:   { playbookBook: bookAt(timeInCycle) },
  };
}

export const PLAYBOOK_GESTURE = gestureDefinition({
  name:                  'playbook',
  intents:               { playbook: singleFormOf(null, PLAYBOOK_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            playbookPartOf,
});
