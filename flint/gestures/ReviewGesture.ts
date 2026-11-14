/**
 * Implements `02-animations.md`, "Gestures", "Review": Flint reads the four lines of a floating sheet through a looking glass, then gives
 * a verdict, and starts again. One pentagon holds the glass at a fixed offset from the lens. Reading goes from left to right on the
 * screen whatever the facing ("Reading and writing direction", "Review"): facing left, `1 - along` takes the place of `along`.
 */
import type { Facing, PosePart, ReviewVerdict }            from '../SpritePose.ts';
import { HAND_SHAPE }                                      from '../constants/HandShape.ts';
import { LOOKING_GLASS_SHAPE, SHEET_SHAPE }                from '../constants/PropShapes.ts';
import { REVIEW_GESTURE_VALUES, REVIEW_JAB, REVIEW_PACES } from '../constants/ReviewGestureValues.ts';
import type { GestureDefinition, GestureInput, Mood }      from './GestureDefinition.ts';
import { workingMoodPartOf }                               from './WorkingMoodPart.ts';

/** Where the review stands at one moment: the line being read and how far along it, or the verdict and how far through it. */
interface ReviewMoment {
  readonly lineIndex:       number;
  /** From 0 to 1 along the line on the screen, from its left end; 1 during the verdict. */
  readonly across:          number;
  readonly isReading:       boolean;
  readonly verdictProgress: number;
  readonly verdict:         ReviewVerdict;
}

function reviewMomentAt(mood: Mood, elapsedMilliseconds: number, facing: Facing): ReviewMoment {
  const pace = REVIEW_PACES[mood];
  const readingMilliseconds = SHEET_SHAPE.LINE_COUNT * pace.LINE_MILLISECONDS;
  const cycleMilliseconds = readingMilliseconds + pace.VERDICT_MILLISECONDS;
  const cycleIndex = Math.floor(elapsedMilliseconds / cycleMilliseconds);
  const timeInCycle = elapsedMilliseconds - (cycleIndex * cycleMilliseconds);
  const isReading = timeInCycle < readingMilliseconds;
  const along = isReading ? (timeInCycle / pace.LINE_MILLISECONDS) % 1 : 1;
  const isApproved = mood !== 'angry' && cycleIndex % 2 === 0;
  return {
    lineIndex:       Math.min(SHEET_SHAPE.LINE_COUNT - 1, Math.floor(timeInCycle / pace.LINE_MILLISECONDS)),
    across:          facing === 1 ? along : 1 - along,
    isReading,
    verdictProgress: isReading ? 0 : (timeInCycle - readingMilliseconds) / pace.VERDICT_MILLISECONDS,
    verdict:         isApproved ? 'tick' : 'cross',
  };
}

function angryJabAt(mood: Mood, elapsedMilliseconds: number): number {
  if (mood !== 'angry') return 0;
  return REVIEW_JAB.JAB_UNITS * Math.max(0, Math.sin(elapsedMilliseconds / REVIEW_JAB.JAB_DIVISOR_MILLISECONDS));
}

function sheetOffsetYAt(mood: Mood, moment: ReviewMoment, jab: number): number {
  if (mood === 'angry') return jab * REVIEW_JAB.SHEET_SHARE;
  if (mood === 'busy' && !moment.isReading) return -REVIEW_GESTURE_VALUES.PAGE_TURN_RISE_UNITS * Math.sin(Math.PI * moment.verdictProgress);
  return 0;
}

/** The normal mood answers its own verdict: happy eyes on a tick, a frown and a deeper lean on a cross. */
function normalVerdictPartOf(moment: ReviewMoment): PosePart {
  if (moment.isReading) return {};
  if (moment.verdict === 'tick') return { eyes: { happiness: 1 } };
  return { body: { leanDegrees: REVIEW_GESTURE_VALUES.CROSS_LEAN_DEGREES }, eyes: { height: REVIEW_GESTURE_VALUES.CROSS_EYE_HEIGHT_UNITS } };
}

function reviewPartOf(input: GestureInput): PosePart {
  const moment = reviewMomentAt(input.mood, input.elapsedMilliseconds, input.facing);
  const jab = angryJabAt(input.mood, input.elapsedMilliseconds);
  const lineY = SHEET_SHAPE.FIRST_LINE_Y_UNITS + (SHEET_SHAPE.LINE_SPACING_UNITS * moment.lineIndex) + (SHEET_SHAPE.LINE_DROP_UNITS * moment.across);
  const lensCentreX = REVIEW_GESTURE_VALUES.LENS_START_X_UNITS + (REVIEW_GESTURE_VALUES.LENS_TRAVEL_UNITS * moment.across) - jab;
  const lensCentreY = lineY + REVIEW_GESTURE_VALUES.LENS_BELOW_LINE_UNITS - jab;
  const moodPart = workingMoodPartOf(input.mood, input.elapsedMilliseconds);
  const verdictPart: PosePart = input.mood === 'normal' ? normalVerdictPartOf(moment) : {};
  return {
    ...moodPart,
    body: { ...moodPart.body, ...verdictPart.body },
    eyes: {
      ...moodPart.eyes,
      lift:  REVIEW_GESTURE_VALUES.EYE_LIFT_FIRST_LINE_UNITS + (REVIEW_GESTURE_VALUES.EYE_LIFT_PER_LINE_UNITS * moment.lineIndex),
      shift: REVIEW_GESTURE_VALUES.EYE_SHIFT_START_UNITS + (REVIEW_GESTURE_VALUES.EYE_SHIFT_TRAVEL_UNITS * moment.across),
      ...verdictPart.eyes,
    },
    nearHand: {
      cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT,
      centreX:     lensCentreX + LOOKING_GLASS_SHAPE.GRIP_OFFSET_X_UNITS,
      centreY:     lensCentreY + LOOKING_GLASS_SHAPE.GRIP_OFFSET_Y_UNITS,
      radius:      REVIEW_GESTURE_VALUES.HAND_RADIUS_UNITS,
      turnDegrees: REVIEW_GESTURE_VALUES.HAND_TURN_DEGREES,
      placement:   'held-to-lens',
    },
    farHand: null,
    props:   {
      sheet: {
        shown:            1,
        readLineIndex:    moment.isReading ? moment.lineIndex : null,
        stackedPageCount: REVIEW_PACES[input.mood].STACKED_PAGE_COUNT,
        offsetY:          sheetOffsetYAt(input.mood, moment, jab),
        verdict:          moment.isReading ? null : moment.verdict,
      },
      lookingGlass: { shown: 1, centreX: lensCentreX, centreY: lensCentreY },
    },
  };
}

export const REVIEW_GESTURE = Object.freeze<GestureDefinition>({
  name:                    'review',
  moods:                   ['normal', 'busy', 'angry'],
  durationMilliseconds:    null,
  continuesWhileWalking:   false,
  continuesWhileJumping:   false,
  stillMomentMilliseconds: 0,
  verdict:                 null,
  targetPose:              reviewPartOf,
});
