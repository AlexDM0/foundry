/**
 * Implements `02-animations.md`, "Gestures", "Research": a book, notes, a search and a hologram, one study after the other; and "Reading
 * and writing direction", "Book", "Ticket and notes" and "Search". Each study shows only its own prop, so the last one fades out as the
 * next fades in.
 */
import type {
  Facing,
  HandPose,
  PosePart,
  PropsPose
} from '../SpritePose.ts';
import { HIDDEN_PROPS }          from '../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE } from '../constants/BodyShape.ts';
import {
  BOOK_SHAPE,
  HOLOGRAM_SHAPE,
  NOTEPAD_SHAPE,
  SEARCH_BAR_SHAPE
} from '../constants/PropShapes.ts';
import {
  BOOK_STUDY,
  HOLOGRAM_STUDY,
  NOTES_STUDY,
  RESEARCH,
  SEARCH_STUDY
} from '../constants/ResearchMotion.ts';
import { AnimationCurveUtil }                   from '../utils/AnimationCurveUtil.ts';
import { BookGeometryUtil }                     from './BookGeometryUtil.ts';
import type { GestureDefinition, GestureInput } from './GestureDefinition.ts';
import { GestureTimelineUtil }                  from './GestureTimelineUtil.ts';
import type { WritingPaper }                    from './PenWritingUtil.ts';
import { PenWritingUtil }                       from './PenWritingUtil.ts';

export type ResearchStudy = 'book' | 'notes' | 'search' | 'hologram';

export const RESEARCH_STUDIES: readonly ResearchStudy[] = Object.freeze(['book', 'notes', 'search', 'hologram']);

export interface StudyMoment {
  readonly study:             ResearchStudy;
  /** Since this study started. */
  readonly studyMilliseconds: number;
  /** From 0 to 1 over the study: the `part` of the handoff. */
  readonly part:              number;
}

/** Which study runs at this time in the gesture, and how far it is. */
export function studyMomentOf(elapsedMilliseconds: number): StudyMoment {
  const cycleMilliseconds = RESEARCH.STUDY_MILLISECONDS * RESEARCH_STUDIES.length;
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(elapsedMilliseconds, cycleMilliseconds);
  const studyIndex = Math.min(RESEARCH_STUDIES.length - 1, Math.floor(timeInCycle / RESEARCH.STUDY_MILLISECONDS));
  const studyMilliseconds = timeInCycle - (studyIndex * RESEARCH.STUDY_MILLISECONDS);
  return { study: RESEARCH_STUDIES[studyIndex] ?? 'book', studyMilliseconds, part: studyMilliseconds / RESEARCH.STUDY_MILLISECONDS };
}

const STUDY_PROPS_HIDDEN: Partial<PropsPose> = Object.freeze({
  book: HIDDEN_PROPS.book, notepad: HIDDEN_PROPS.notepad, searchBar: HIDDEN_PROPS.searchBar, hologram: HIDDEN_PROPS.hologram,
});

const NOTEPAD_PAPER: WritingPaper = Object.freeze({
  lineStartX:       NOTEPAD_SHAPE.LINE_START_X_UNITS,
  lineYs:           NOTEPAD_SHAPE.LINE_Y_UNITS,
  fullLineUnits:    NOTEPAD_SHAPE.FULL_LINE_UNITS,
  lineMilliseconds: NOTES_STUDY.LINE_MILLISECONDS,
});

const WORKING_BODY = Object.freeze({ leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES });

function swingOf(part: number, halfTurns: number): number {
  return Math.sin(halfTurns * Math.PI * part);
}

/** The hand rests at the lower corner that is right on the screen, and holds the outer edge of the page while it turns. */
function bookStudyPart(moment: StudyMoment, facing: Facing): PosePart {
  const turnProgress = AnimationCurveUtil.clamp((moment.part - BOOK_STUDY.PAGE_TURN_STARTS_PART) / (BOOK_STUDY.PAGE_TURN_ENDS_PART - BOOK_STUDY.PAGE_TURN_STARTS_PART));
  const isTurning = turnProgress > 0 && turnProgress < 1;
  const pageSpread = Math.cos(Math.PI * turnProgress) * facing;
  const edge = BookGeometryUtil.turningPageEdgeOf(pageSpread);
  const grip = isTurning
    ? { x: edge.x + facing, y: edge.topY + BOOK_STUDY.HAND_BELOW_PAGE_TOP_UNITS }
    : { x: BOOK_SHAPE.SPINE_X_UNITS + (BOOK_STUDY.HAND_REST_FROM_SPINE_UNITS * facing), y: BOOK_STUDY.HAND_REST_Y_UNITS };
  const hand = BookGeometryUtil.pointOnBook(grip);
  return {
    body: WORKING_BODY,
    eyes: {
      height: BOOK_STUDY.EYE_HEIGHT_UNITS,
      lift:   BOOK_STUDY.EYE_LIFT_UNITS,
      shift:  BOOK_STUDY.EYE_SHIFT_UNITS + (BOOK_STUDY.EYE_SHIFT_SWING_UNITS * swingOf(moment.part, BOOK_STUDY.EYE_SHIFT_HALF_TURNS)),
    },
    nearHand: {
      cornerCount: BOOK_STUDY.HAND_CORNER_COUNT, centreX: hand.x, centreY: hand.y, radius: BOOK_STUDY.HAND_RADIUS_UNITS, turnDegrees: 0, placement: 'eased',
    },
    farHand: null,
    props:   { ...STUDY_PROPS_HIDDEN, book: { shown: 1, turningPageSpread: isTurning ? pageSpread : null } },
  };
}

function notesStudyPart(moment: StudyMoment, elapsedMilliseconds: number, facing: Facing): PosePart {
  const writing = PenWritingUtil.writingMomentOf(NOTEPAD_PAPER, moment.studyMilliseconds, elapsedMilliseconds, facing);
  return {
    body:     WORKING_BODY,
    eyes:     { ...writing.eyes, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS },
    nearHand: writing.pen,
    farHand:  null,
    props:    { ...STUDY_PROPS_HIDDEN, notepad: { shown: 1, writtenLengths: writing.writtenLengths } },
  };
}

function typingHandOf(centreX: number, centreY: number, radius: number): HandPose {
  return {
    cornerCount: SEARCH_STUDY.HAND_CORNER_COUNT, centreX, centreY, radius, turnDegrees: SEARCH_STUDY.HAND_TURN_DEGREES, placement: 'eased',
  };
}

/** The hands tap in turn as in normal typing; the query grows in steps. */
function searchStudyPart(moment: StudyMoment, elapsedMilliseconds: number): PosePart {
  const beat = Math.sin(elapsedMilliseconds / SEARCH_STUDY.TAP_DIVISOR_MILLISECONDS);
  const halfway = 1 / 2;
  const nearTap = -SEARCH_STUDY.TAP_UNITS * (halfway + (halfway * beat));
  const farTap = -SEARCH_STUDY.TAP_UNITS * (halfway - (halfway * beat));
  const typedSteps = Math.floor(SEARCH_STUDY.QUERY_STEPS_PER_STUDY * moment.part);
  return {
    body:     WORKING_BODY,
    eyes:     { height: SEARCH_STUDY.EYE_HEIGHT_UNITS, lift: SEARCH_STUDY.EYE_LIFT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS },
    nearHand: typingHandOf(SEARCH_STUDY.NEAR_HAND_X_UNITS, SEARCH_STUDY.NEAR_HAND_Y_UNITS + nearTap, SEARCH_STUDY.NEAR_HAND_RADIUS_UNITS),
    farHand:  typingHandOf(SEARCH_STUDY.FAR_HAND_X_UNITS, SEARCH_STUDY.FAR_HAND_Y_UNITS + farTap, SEARCH_STUDY.FAR_HAND_RADIUS_UNITS),
    props:    {
      ...STUDY_PROPS_HIDDEN,
      keyboard:  { shown: 1, drop: 0 },
      searchBar: { shown: 1, queryLength: SEARCH_BAR_SHAPE.FULL_QUERY_UNITS * AnimationCurveUtil.clamp(typedSteps / SEARCH_STUDY.QUERY_STEP_COUNT) },
    },
  };
}

/** No hands: Flint reads the light with narrow eyes that move down the panel and to and fro. */
function hologramStudyPart(moment: StudyMoment, elapsedMilliseconds: number): PosePart {
  const scanProgress = AnimationCurveUtil.cycleProgressOf(moment.studyMilliseconds, HOLOGRAM_STUDY.SCAN_MILLISECONDS);
  return {
    body: WORKING_BODY,
    eyes: {
      height: HOLOGRAM_STUDY.EYE_HEIGHT_UNITS,
      lift:   HOLOGRAM_STUDY.EYE_LIFT_START_UNITS + (HOLOGRAM_STUDY.EYE_LIFT_TRAVEL_UNITS * moment.part),
      shift:  HOLOGRAM_STUDY.EYE_SHIFT_UNITS + (HOLOGRAM_STUDY.EYE_SHIFT_SWING_UNITS * swingOf(moment.part, HOLOGRAM_STUDY.EYE_SHIFT_HALF_TURNS)),
    },
    nearHand: null,
    farHand:  null,
    props:    {
      ...STUDY_PROPS_HIDDEN,
      hologram: {
        shown:     1,
        flicker:   HOLOGRAM_STUDY.FLICKER_BASE + (HOLOGRAM_STUDY.FLICKER_SWING * Math.sin(elapsedMilliseconds / HOLOGRAM_STUDY.FLICKER_DIVISOR_MILLISECONDS)),
        scanLineY: HOLOGRAM_SHAPE.SCAN_LINE_TOP_Y_UNITS + (HOLOGRAM_STUDY.SCAN_TRAVEL_UNITS * scanProgress),
      },
    },
  };
}

function researchPartOf(input: GestureInput): PosePart {
  const moment = studyMomentOf(input.elapsedMilliseconds);
  if (moment.study === 'book') return bookStudyPart(moment, input.facing);
  if (moment.study === 'notes') return notesStudyPart(moment, input.elapsedMilliseconds, input.facing);
  if (moment.study === 'search') return searchStudyPart(moment, input.elapsedMilliseconds);
  return hologramStudyPart(moment, input.elapsedMilliseconds);
}

export const RESEARCH_GESTURE = Object.freeze<GestureDefinition>({
  name:                    'research',
  moods:                   ['normal'],
  durationMilliseconds:    null,
  continuesWhileWalking:   false,
  continuesWhileJumping:   false,
  stillMomentMilliseconds: RESEARCH.STILL_MOMENT_MILLISECONDS,
  verdict:                 null,
  targetPose:              researchPartOf,
});
