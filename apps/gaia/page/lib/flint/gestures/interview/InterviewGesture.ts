/**
 * Interview: two rounds in which Flint asks the user with the question mark, listens and nods, and
 * writes one line of a notepad with the rules of the notes study; then one more nod, the happy eyes and a tick. The question mark comes
 * with the spring of an emote mark and leaves with its fade; a written line grows from left to right on the screen whatever the facing.
 */
import type { EmoteMarkPoseOf, PosePart }  from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { NOTEPAD_SHAPE }                   from '../../props/shapes/constants/NotepadShape.ts';
import { AnimationCurveUtil }              from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureMarkUtil }                 from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import type { WritingPaper }               from '../PenWritingUtil.ts';
import { PenWritingUtil }                  from '../PenWritingUtil.ts';
import {
  INTERVIEW_ASKING,
  INTERVIEW_EXTENT,
  INTERVIEW_NOD,
  INTERVIEW_NOTEPAD,
  INTERVIEW_TIMELINE,
} from './constants/InterviewValues.ts';

const NOTEPAD_PAPER: WritingPaper = Object.freeze({
  lineStartX:       NOTEPAD_SHAPE.LINE_START_X_UNITS,
  lineYs:           NOTEPAD_SHAPE.LINE_Y_UNITS,
  fullLineUnits:    NOTEPAD_SHAPE.FULL_LINE_UNITS,
  lineMilliseconds: INTERVIEW_NOTEPAD.LINE_MILLISECONDS,
});

/** The question mark of Doubt while Flint asks. */
function questionMarkAt(timeInRound: number): EmoteMarkPoseOf<'question'> | null {
  return GestureMarkUtil.springingMarkIn('question', timeInRound, { startMilliseconds: 0, endMilliseconds: INTERVIEW_TIMELINE.ASKING_ENDS_MILLISECONDS });
}

/** The lean of the nods that started this long ago: each nod goes out and back once. */
function noddingLeanAt(sinceNodsStarted: number): number {
  const nodProgress = (sinceNodsStarted % INTERVIEW_NOD.MILLISECONDS) / INTERVIEW_NOD.MILLISECONDS;
  return INTERVIEW_NOD.LEAN_DEGREES * Math.sin(Math.PI * nodProgress);
}

const NODDING_EYES = { shift: INTERVIEW_NOD.EYE_SHIFT_UNITS, height: INTERVIEW_NOD.EYE_HEIGHT_UNITS } as const;

function roundPartOf(input: GestureInput, timeInCycle: number): PosePart {
  const roundIndex = Math.floor(timeInCycle / INTERVIEW_TIMELINE.ROUND_MILLISECONDS);
  const timeInRound = timeInCycle - (roundIndex * INTERVIEW_TIMELINE.ROUND_MILLISECONDS);
  const writingMilliseconds = (roundIndex * INTERVIEW_NOTEPAD.LINE_MILLISECONDS)
    + AnimationCurveUtil.clamp(timeInRound - INTERVIEW_TIMELINE.LISTENING_ENDS_MILLISECONDS, 0, INTERVIEW_NOTEPAD.LINE_MILLISECONDS);
  const writing = PenWritingUtil.writingMomentOf(NOTEPAD_PAPER, writingMilliseconds, input.elapsedMilliseconds, input.facing);
  const notepad = {
    shown: 1, writtenLengths: writing.writtenLengths, linesOpacity: 1, tickOpacity: 0
  };
  if (timeInRound < INTERVIEW_TIMELINE.ASKING_ENDS_MILLISECONDS) {
    return {
      body:      { leanDegrees: INTERVIEW_ASKING.LEAN_DEGREES },
      eyes:      { shift: INTERVIEW_ASKING.EYE_SHIFT_UNITS, height: INTERVIEW_ASKING.EYE_HEIGHT_UNITS, rightHeightOverride: INTERVIEW_ASKING.RIGHT_EYE_HEIGHT_UNITS },
      nearHand:  null,
      emoteMark: questionMarkAt(timeInRound),
      props:     { interviewNotepad: notepad },
    };
  }
  if (timeInRound < INTERVIEW_TIMELINE.LISTENING_ENDS_MILLISECONDS) {
    return {
      body:     { leanDegrees: noddingLeanAt(timeInRound - INTERVIEW_TIMELINE.ASKING_ENDS_MILLISECONDS) },
      eyes:     NODDING_EYES,
      nearHand: null,
      props:    { interviewNotepad: notepad },
    };
  }
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, ...writing.eyes },
    nearHand: writing.pen,
    props:    { interviewNotepad: notepad },
  };
}

/** After both rounds: one more nod with the happy eyes and a tick, then the written lines and the tick fade out. */
function endPartOf(timeInCycle: number): PosePart {
  const sinceEnd = timeInCycle - INTERVIEW_TIMELINE.END_STARTS_MILLISECONDS;
  const fading = GestureTimelineUtil.progressBetween(timeInCycle, INTERVIEW_TIMELINE.LINES_FADE_STARTS_MILLISECONDS, INTERVIEW_TIMELINE.CYCLE_MILLISECONDS);
  const isHappy = timeInCycle < INTERVIEW_TIMELINE.HAPPY_ENDS_MILLISECONDS;
  return {
    body:     { leanDegrees: sinceEnd < INTERVIEW_NOD.MILLISECONDS ? noddingLeanAt(sinceEnd) : 0 },
    eyes:     { ...NODDING_EYES, ...(isHappy ? { happiness: 1 } : {}) },
    nearHand: null,
    props:    {
      interviewNotepad: {
        shown:          1,
        writtenLengths: NOTEPAD_SHAPE.LINE_Y_UNITS.map((_lineY, i) => (i < INTERVIEW_TIMELINE.ROUND_COUNT ? NOTEPAD_SHAPE.FULL_LINE_UNITS : 0)),
        linesOpacity:   1 - fading,
        tickOpacity:    1 - fading,
      },
    },
  };
}

function interviewPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, INTERVIEW_TIMELINE.CYCLE_MILLISECONDS);
  return timeInCycle < INTERVIEW_TIMELINE.END_STARTS_MILLISECONDS ? { farHand: null, ...roundPartOf(input, timeInCycle) } : { farHand: null, ...endPartOf(timeInCycle) };
}

export const INTERVIEW_GESTURE = gestureDefinition({
  name:                  'interview',
  intents:               { interview: singleFormOf(null, INTERVIEW_TIMELINE.STILL_MOMENT_MILLISECONDS, INTERVIEW_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            interviewPartOf,
});
