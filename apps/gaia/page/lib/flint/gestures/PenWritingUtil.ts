/**
 * Writing on paper, shared by the notes study and the ticket:
 * lines fill one after the other, each grows from its left end on the screen, and the pen follows the end that grows.
 */
import type { Facing, Point }      from '../SpriteGeometry.ts';
import type { EyesPose, HandPose } from '../SpritePose.ts';
import { PAPER_SHAPE }             from '../props/shapes/constants/SharedShapes.ts';
import { AnimationCurveUtil }      from '../utils/AnimationCurveUtil.ts';
import { PEN, WRITING_EYES }       from './constants/PenMotion.ts';

/** The lines of one paper, in Flint's own units, and how long one line takes to write. */
export interface WritingPaper {
  readonly lineStartX:       number;
  readonly lineYs:           readonly number[];
  readonly fullLineUnits:    number;
  readonly lineMilliseconds: number;
}

export interface WritingMoment {
  readonly writtenLengths: readonly number[];
  readonly pen:            HandPose;
  readonly eyes:           Partial<EyesPose>;
}

/** The growing end of a line in Flint's own units: facing left, a line grows from the far end of the paper. */
function writtenEndOf(paper: WritingPaper, lineY: number, writtenLength: number, facing: Facing): Point {
  const along = facing === 1 ? writtenLength : paper.fullLineUnits - writtenLength;
  return { x: paper.lineStartX + along, y: lineY + (PAPER_SHAPE.SLOPE * along) };
}

/**
 * The written lines, the pen and the eyes after writing for this long; `elapsedMilliseconds` is the gesture's own time, for the pen's
 * wobble. Before writing starts the pen waits at the start of the first line.
 */
function writingMomentOf(paper: WritingPaper, writingMilliseconds: number, elapsedMilliseconds: number, facing: Facing): WritingMoment {
  const lineCount = paper.lineYs.length;
  const writtenLines = AnimationCurveUtil.clamp(writingMilliseconds / paper.lineMilliseconds, 0, lineCount);
  const writingLineIndex = Math.min(lineCount - 1, Math.floor(writtenLines));
  const writtenLengths = paper.lineYs.map((_lineY, i) => paper.fullLineUnits * AnimationCurveUtil.clamp(writtenLines - i));
  const writingLineY = paper.lineYs[writingLineIndex] ?? 0;
  const end = writtenEndOf(paper, writingLineY, writtenLengths[writingLineIndex] ?? 0, facing);
  return {
    writtenLengths,
    pen: {
      cornerCount: PEN.CORNER_COUNT,
      centreX:     end.x + (PEN.OFFSET_X_UNITS * facing),
      centreY:     end.y + PEN.OFFSET_Y_UNITS + (PEN.WOBBLE_UNITS * Math.sin(elapsedMilliseconds / PEN.WOBBLE_DIVISOR_MILLISECONDS)),
      radius:      PEN.RADIUS_UNITS,
      turnDegrees: PEN.TURN_DEGREES * facing,
      placement:   'eased',
    },
    eyes: { height: WRITING_EYES.HEIGHT_UNITS, lift: (writingLineY + WRITING_EYES.LIFT_OFFSET_UNITS) / WRITING_EYES.LIFT_DIVISOR },
  };
}

export const PenWritingUtil = Object.freeze({ writtenEndOf, writingMomentOf });
