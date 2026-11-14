/**
 * Implements `02-animations.md`, "Gestures", "Review": Flint reads the four lines of a floating sheet through a looking glass, then gives
 * a verdict, and starts again. One pentagon holds the glass at a fixed offset from the lens. Reading goes from left to right on the
 * screen whatever the facing ("Reading and writing direction", "Review"): facing left, `1 - along` takes the place of `along`.
 */
import type { Facing }                                     from '../../SpriteGeometry.ts';
import type { PosePart }                                   from '../../SpritePose.ts';
import { HAND_SHAPE }                                      from '../../constants/HandShape.ts';
import { LOOKING_GLASS_SHAPE }                             from '../../props/looking-glass/constants/LookingGlassValues.ts';
import { SHEET_SHAPE }                                     from '../../props/shapes/constants/SheetShape.ts';
import type { ReviewVerdict }                              from '../../props/sheet/SheetProp.ts';
import type { GestureInput }                               from '../GestureDefinition.ts';
import { gestureDefinition }                               from '../GestureDefinition.ts';
import { ReadingLensUtil }                                 from '../ReadingLensUtil.ts';
import type { WorkingVariant }                             from '../WorkingVariantPart.ts';
import { workingVariantPartOf }                            from '../WorkingVariantPart.ts';
import { REVIEW_GESTURE_VALUES, REVIEW_JAB, REVIEW_PACES } from './constants/ReviewValues.ts';

/** Where the review stands at one moment: the line being read and how far along it, or the verdict and how far through it. */
interface ReviewMoment {
  readonly lineIndex:       number;
  /** From 0 to 1 along the line on the screen, from its left end; 1 during the verdict. */
  readonly across:          number;
  readonly isReading:       boolean;
  readonly verdictProgress: number;
  readonly verdict:         ReviewVerdict;
}

function reviewMomentAt(variant: WorkingVariant, elapsedMilliseconds: number, facing: Facing): ReviewMoment {
  const pace = REVIEW_PACES[variant];
  const readingMilliseconds = SHEET_SHAPE.LINE_COUNT * pace.LINE_MILLISECONDS;
  const cycleMilliseconds = readingMilliseconds + pace.VERDICT_MILLISECONDS;
  const cycleIndex = Math.floor(elapsedMilliseconds / cycleMilliseconds);
  const timeInCycle = elapsedMilliseconds - (cycleIndex * cycleMilliseconds);
  const isReading = timeInCycle < readingMilliseconds;
  const along = isReading ? (timeInCycle / pace.LINE_MILLISECONDS) % 1 : 1;
  const isApproved = variant !== 'angry' && cycleIndex % 2 === 0;
  return {
    lineIndex:       Math.min(SHEET_SHAPE.LINE_COUNT - 1, Math.floor(timeInCycle / pace.LINE_MILLISECONDS)),
    across:          facing === 1 ? along : 1 - along,
    isReading,
    verdictProgress: isReading ? 0 : (timeInCycle - readingMilliseconds) / pace.VERDICT_MILLISECONDS,
    verdict:         isApproved ? 'tick' : 'cross',
  };
}

function angryJabAt(variant: WorkingVariant, elapsedMilliseconds: number): number {
  if (variant !== 'angry') return 0;
  return REVIEW_JAB.JAB_UNITS * Math.max(0, Math.sin(elapsedMilliseconds / REVIEW_JAB.JAB_DIVISOR_MILLISECONDS));
}

function sheetOffsetYAt(variant: WorkingVariant, moment: ReviewMoment, jab: number): number {
  if (variant === 'angry') return jab * REVIEW_JAB.SHEET_SHARE;
  if (variant === 'busy' && !moment.isReading) return -REVIEW_GESTURE_VALUES.PAGE_TURN_RISE_UNITS * Math.sin(Math.PI * moment.verdictProgress);
  return 0;
}

/** The normal variant answers its own verdict: happy eyes on a tick, a frown and a deeper lean on a cross. */
function normalVerdictPartOf(moment: ReviewMoment): PosePart {
  if (moment.isReading) return {};
  if (moment.verdict === 'tick') return { eyes: { happiness: 1 } };
  return { body: { leanDegrees: REVIEW_GESTURE_VALUES.CROSS_LEAN_DEGREES }, eyes: { height: REVIEW_GESTURE_VALUES.CROSS_EYE_HEIGHT_UNITS } };
}

function reviewPartOf(input: GestureInput<WorkingVariant>): PosePart {
  const moment = reviewMomentAt(input.variant, input.elapsedMilliseconds, input.facing);
  const jab = angryJabAt(input.variant, input.elapsedMilliseconds);
  const readingLens = ReadingLensUtil.lensCentreOf(moment.lineIndex, moment.across);
  const lensCentreX = readingLens.x - jab;
  const lensCentreY = readingLens.y - jab;
  const variantPart = workingVariantPartOf(input.variant, input.elapsedMilliseconds);
  const verdictPart: PosePart = input.variant === 'normal' ? normalVerdictPartOf(moment) : {};
  return {
    ...variantPart,
    body: { ...variantPart.body, ...verdictPart.body },
    eyes: {
      ...variantPart.eyes,
      ...ReadingLensUtil.readingEyesOf(moment.lineIndex, moment.across),
      ...verdictPart.eyes,
    },
    nearHand: {
      cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT,
      centreX:     lensCentreX + LOOKING_GLASS_SHAPE.GRIP_OFFSET_X_UNITS,
      centreY:     lensCentreY + LOOKING_GLASS_SHAPE.GRIP_OFFSET_Y_UNITS,
      radius:      REVIEW_GESTURE_VALUES.HAND_RADIUS_UNITS,
      turnDegrees: REVIEW_GESTURE_VALUES.HAND_TURN_DEGREES,
      placement:   { heldTo: 'lookingGlass' },
    },
    farHand: null,
    props:   {
      sheet: {
        shown:            1,
        readLineIndex:    moment.isReading ? moment.lineIndex : null,
        stackedPageCount: REVIEW_PACES[input.variant].STACKED_PAGE_COUNT,
        offsetY:          sheetOffsetYAt(input.variant, moment, jab),
        verdict:          moment.isReading ? null : moment.verdict,
      },
      lookingGlass: { shown: 1, centreX: lensCentreX, centreY: lensCentreY },
    },
  };
}

export const REVIEW_GESTURE = gestureDefinition({
  name:    'review',
  intents: {
    'review':       { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 0 },
    'review-busy':  { variant: 'busy', durationMilliseconds: null, stillMomentMilliseconds: 0 },
    'review-angry': { variant: 'angry', durationMilliseconds: null, stillMomentMilliseconds: 0 },
  },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            reviewPartOf,
});
