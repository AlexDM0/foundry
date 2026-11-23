/**
 * Conflict: Merge with one more step. Two hexagons press the blocks, the teeth hit, the blocks shake
 * and move apart; one triangle files the teeth of the top block over until they fit; then the hexagons press with Merge's travel and the
 * blocks snap as in Merge. The tick is mirrored back by the renderer, so the part is the same either facing.
 */
import type { EyesPose, HandPose, PosePart }              from '../../SpritePose.ts';
import { EYE_SHAPE }                                      from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                                     from '../../constants/HandShape.ts';
import { PRESSED_BLOCKS_SHAPE }                           from '../../props/shapes/constants/PressedBlocksShape.ts';
import { BLOCK_SHAPE }                                    from '../../props/shapes/constants/SharedShapes.ts';
import { AnimationCurveUtil }                             from '../../utils/AnimationCurveUtil.ts';
import { BlockPressUtil }                                 from '../BlockPressUtil.ts';
import type { GestureInput }                              from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }                from '../GestureDefinition.ts';
import { GestureTimelineUtil }                            from '../GestureTimelineUtil.ts';
import { snapSparksAt }                                   from '../SnapSparks.ts';
import { BLOCK_PRESS }                                    from '../constants/BlockPress.ts';
import type { ConflictBlocksState, ConflictShavingState } from './ConflictBlocksProp.ts';
import {
  CONFLICT_FILE,
  CONFLICT_PRESS,
  CONFLICT_SHAVINGS,
  CONFLICT_TEETH,
  CONFLICT_TIMELINE,
} from './constants/ConflictValues.ts';

const { progressBetween } = GestureTimelineUtil;

/** How far each block has moved towards the other: the first press to the hit, apart, and the second press that fits. */
function travelAt(timeInCycle: number): number {
  const firstPress = progressBetween(timeInCycle, CONFLICT_TIMELINE.FIRST_PRESS_STARTS_MILLISECONDS, CONFLICT_TIMELINE.HIT_MILLISECONDS);
  const apart = progressBetween(timeInCycle, CONFLICT_TIMELINE.HIT_MILLISECONDS, CONFLICT_TIMELINE.APART_MILLISECONDS);
  const fitPress = progressBetween(timeInCycle, CONFLICT_TIMELINE.FILING_ENDS_MILLISECONDS, CONFLICT_TIMELINE.SNAP_MILLISECONDS);
  if (timeInCycle < CONFLICT_TIMELINE.HIT_MILLISECONDS) return CONFLICT_PRESS.HIT_TRAVEL_UNITS * firstPress * firstPress;
  if (timeInCycle < CONFLICT_TIMELINE.FILING_ENDS_MILLISECONDS) {
    return CONFLICT_PRESS.HIT_TRAVEL_UNITS + ((CONFLICT_PRESS.APART_TRAVEL_UNITS - CONFLICT_PRESS.HIT_TRAVEL_UNITS) * apart);
  }
  return CONFLICT_PRESS.APART_TRAVEL_UNITS + ((CONFLICT_PRESS.FIT_TRAVEL_UNITS - CONFLICT_PRESS.APART_TRAVEL_UNITS) * fitPress * fitPress);
}

/** The press in progress, from 0 to 1, for the widening of the eyes; null between the presses. */
function pressAt(timeInCycle: number): number | null {
  if (timeInCycle < CONFLICT_TIMELINE.HIT_MILLISECONDS) {
    return progressBetween(timeInCycle, CONFLICT_TIMELINE.FIRST_PRESS_STARTS_MILLISECONDS, CONFLICT_TIMELINE.HIT_MILLISECONDS);
  }
  if (timeInCycle >= CONFLICT_TIMELINE.FILING_ENDS_MILLISECONDS && timeInCycle < CONFLICT_TIMELINE.SNAP_MILLISECONDS) {
    return progressBetween(timeInCycle, CONFLICT_TIMELINE.FILING_ENDS_MILLISECONDS, CONFLICT_TIMELINE.SNAP_MILLISECONDS);
  }
  return null;
}

/** Where the file is: forward from x 26 to x 42 and back in each stroke, slowing at both ends. */
function fileXAt(timeSinceFilingStarts: number): number {
  const stroke = AnimationCurveUtil.cycleProgressOf(timeSinceFilingStarts, CONFLICT_TIMELINE.STROKE_MILLISECONDS);
  const reach = (1 - Math.cos(2 * Math.PI * stroke)) / 2;
  return CONFLICT_FILE.START_X_UNITS + ((CONFLICT_FILE.END_X_UNITS - CONFLICT_FILE.START_X_UNITS) * reach);
}

/** The file comes out of the body before the strokes; during them its place is set exactly, so it makes each full stroke. */
function fileOf(timeInCycle: number): HandPose {
  const isFiling = timeInCycle >= CONFLICT_TIMELINE.FILING_STARTS_MILLISECONDS;
  return {
    cornerCount: HAND_SHAPE.POINTING_CORNER_COUNT,
    centreX:     isFiling ? fileXAt(timeInCycle - CONFLICT_TIMELINE.FILING_STARTS_MILLISECONDS) : CONFLICT_FILE.START_X_UNITS,
    centreY:     CONFLICT_FILE.Y_UNITS,
    radius:      CONFLICT_FILE.RADIUS_UNITS,
    turnDegrees: CONFLICT_FILE.TURN_DEGREES,
    placement:   isFiling ? 'exact-position' : 'eased',
  };
}

/** Two shavings for each stroke drop from where the file is, fall with `p²` and fade; before and after their fall they are not seen. */
function shavingsAt(timeInCycle: number): ConflictShavingState[] {
  const apartTopBlockY = PRESSED_BLOCKS_SHAPE.TOP_BLOCK_Y_UNITS + CONFLICT_PRESS.APART_TRAVEL_UNITS;
  const startY = apartTopBlockY + BLOCK_SHAPE.HEIGHT_UNITS + CONFLICT_TEETH.HEIGHT_UNITS;
  return Array.from({ length: CONFLICT_FILE.STROKE_COUNT }, (_unused, stroke) => CONFLICT_SHAVINGS.BIRTH_STROKE_FRACTIONS.map((fraction) => {
    const sinceFilingStarts = CONFLICT_TIMELINE.STROKE_MILLISECONDS * (stroke + fraction);
    const fall = (timeInCycle - CONFLICT_TIMELINE.FILING_STARTS_MILLISECONDS - sinceFilingStarts) / CONFLICT_SHAVINGS.FALL_MILLISECONDS;
    const fallen = AnimationCurveUtil.clamp(fall);
    return {
      x:       fileXAt(sinceFilingStarts),
      y:       startY + (CONFLICT_SHAVINGS.FALL_UNITS * fallen * fallen),
      opacity: fall >= 0 && fall < 1 ? 1 - fall : 0,
    };
  })).flat();
}

function eyesAt(timeInCycle: number): Partial<EyesPose> {
  const press = pressAt(timeInCycle);
  const merging = { lift: BLOCK_PRESS.EYE_LIFT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS };
  if (timeInCycle >= CONFLICT_TIMELINE.SNAP_MILLISECONDS) {
    return { ...merging, height: BLOCK_PRESS.EYE_HEIGHT_UNITS + BLOCK_PRESS.EYE_WIDENING_UNITS, happiness: 1 };
  }
  if (press !== null) return { ...merging, height: BlockPressUtil.pressingEyeHeightOf(press) };
  const isFiling = timeInCycle >= CONFLICT_TIMELINE.APART_MILLISECONDS;
  return {
    ...merging,
    height:       isFiling ? CONFLICT_PRESS.FILING_EYE_HEIGHT_UNITS : BLOCK_PRESS.EYE_HEIGHT_UNITS,
    slantDegrees: CONFLICT_PRESS.HIT_SLANT_DEGREES,
  };
}

function blocksAt(timeInCycle: number, topBlockY: number, bottomBlockY: number): ConflictBlocksState {
  const isSnapped = timeInCycle >= CONFLICT_TIMELINE.SNAP_MILLISECONDS;
  const sinceHit = timeInCycle - CONFLICT_TIMELINE.HIT_MILLISECONDS;
  const isShaking = sinceHit >= 0 && sinceHit < CONFLICT_TIMELINE.SHAKE_MILLISECONDS;
  const leaving = progressBetween(timeInCycle, CONFLICT_TIMELINE.LEAVES_MILLISECONDS, CONFLICT_TIMELINE.CYCLE_MILLISECONDS);
  const filed = progressBetween(timeInCycle, CONFLICT_TIMELINE.FILING_STARTS_MILLISECONDS, CONFLICT_TIMELINE.FILING_ENDS_MILLISECONDS);
  return {
    shown:         1,
    topBlockY,
    bottomBlockY,
    blocksShakeX:  isShaking ? CONFLICT_PRESS.SHAKE_UNITS * Math.sin(sinceHit / CONFLICT_PRESS.SHAKE_DIVISOR_MILLISECONDS) : 0,
    topTeethX:     CONFLICT_TEETH.TOP_START_X_UNITS.map((startX, i) => startX + (((CONFLICT_TEETH.TOP_FILED_X_UNITS[i] ?? startX) - startX) * filed)),
    blocksOpacity: isSnapped ? 0 : progressBetween(timeInCycle, 0, CONFLICT_TIMELINE.FADE_IN_MILLISECONDS),
    seamY:         (topBlockY + BLOCK_SHAPE.HEIGHT_UNITS + bottomBlockY) / 2,
    impactOpacity: sinceHit >= 0 && sinceHit < CONFLICT_TIMELINE.IMPACT_LINES_MILLISECONDS ? 1 : 0,
    shavings:      shavingsAt(timeInCycle),
    ...BlockPressUtil.snappedBlockOf(isSnapped, leaving),
    sparks:        snapSparksAt(timeInCycle - CONFLICT_TIMELINE.SNAP_MILLISECONDS),
  };
}

function conflictPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, CONFLICT_TIMELINE.CYCLE_MILLISECONDS);
  const travel = travelAt(timeInCycle);
  const topBlockY = PRESSED_BLOCKS_SHAPE.TOP_BLOCK_Y_UNITS + travel;
  const bottomBlockY = PRESSED_BLOCKS_SHAPE.BOTTOM_BLOCK_Y_UNITS - travel;
  const isSnapped = timeInCycle >= CONFLICT_TIMELINE.SNAP_MILLISECONDS;
  const isSquashed = isSnapped && timeInCycle < CONFLICT_TIMELINE.SNAP_MILLISECONDS + CONFLICT_TIMELINE.SQUASH_MILLISECONDS;
  const isPressing = timeInCycle < CONFLICT_TIMELINE.HIT_MILLISECONDS || timeInCycle >= CONFLICT_TIMELINE.FILING_ENDS_MILLISECONDS;
  const hasFile = !isPressing && timeInCycle >= CONFLICT_TIMELINE.FILE_APPEARS_MILLISECONDS;
  const pressingHands = isPressing ? BlockPressUtil.pressingHandsOf(topBlockY, bottomBlockY, isSnapped) : null;
  return {
    body:     BlockPressUtil.pressingBodyOf(isSquashed),
    eyes:     eyesAt(timeInCycle),
    nearHand: pressingHands?.near ?? (hasFile ? fileOf(timeInCycle) : null),
    farHand:  pressingHands?.far ?? null,
    props:    { conflictBlocks: blocksAt(timeInCycle, topBlockY, bottomBlockY) },
    ...(isSnapped ? { exactFields: ['happy-eyes'] } : {}),
  };
}

export const CONFLICT_GESTURE = gestureDefinition({
  name:                  'conflict',
  intents:               { conflict: singleFormOf(null, CONFLICT_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            conflictPartOf,
});
