/**
 * The initials of Waiver as straight steps along their curves, so the written part grows from the start by its length, as a pen writes.
 * The initials are never mirrored: facing left they are mirrored back about their own middle, so they still read from left to right.
 */
import type { Point }           from '../../SpriteGeometry.ts';
import type { QuadraticStroke } from '../../props/shapes/TracedPathUtil.ts';
import { TracedPathUtil }       from '../../props/shapes/TracedPathUtil.ts';
import { WAIVER_INITIALS }      from './constants/WaiverValues.ts';

/** Each stroke is given relative to the end of the one before. */
function strokesFrom(start: Point): readonly QuadraticStroke[] {
  const strokes: QuadraticStroke[] = [];
  let strokeStart = start;
  for (const stroke of WAIVER_INITIALS.STROKES) {
    const end = { x: strokeStart.x + stroke.END_X_UNITS, y: strokeStart.y + stroke.END_Y_UNITS };
    strokes.push({ control: { x: strokeStart.x + stroke.CONTROL_X_UNITS, y: strokeStart.y + stroke.CONTROL_Y_UNITS }, end });
    strokeStart = end;
  }
  return strokes;
}

const INITIALS_START: Point = Object.freeze({ x: WAIVER_INITIALS.START_X_UNITS, y: WAIVER_INITIALS.START_Y_UNITS });

const INITIALS_POINTS = TracedPathUtil.pointsOfStrokes(INITIALS_START, strokesFrom(INITIALS_START), WAIVER_INITIALS.STEPS_PER_STROKE);

export const WaiverInitialsUtil = Object.freeze({
  /** The points of the written part, when this share of the initials' length is written; the last point is where the pen is. */
  writtenPointsOf: (writtenShare: number): readonly Point[] => TracedPathUtil.leadingShareOf(INITIALS_POINTS, writtenShare),

  /** The middle of the initials across: the x they are mirrored back about when Flint faces left. */
  mirrorAxisX: (): number => {
    const xs = INITIALS_POINTS.map((point) => point.x);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  },
});
