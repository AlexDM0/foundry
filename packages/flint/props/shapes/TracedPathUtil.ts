/**
 * A path that grows along its length, as a pen writes it or a fuse burns it (`06-more-animations.md`, "Waiver", "Incident fuse" and "Ink
 * the draft"): its curves as straight steps, the part of it up to a share of its length, and its path data.
 */
import type { Point }         from '../../SpriteGeometry.ts';
import { SvgTextUtil }        from '../../drawing/SvgTextUtil.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';

/** A quadratic curve from the end of the one before, by its control point and its end. */
export interface QuadraticStroke {
  readonly control: Point;
  readonly end:     Point;
}

function distanceBetween(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export const TracedPathUtil = Object.freeze({
  /** The point at `along`, from 0 to 1, on the quadratic curve from `start`. */
  quadraticPointOf: (start: Point, stroke: QuadraticStroke, along: number): Point => {
    const rest = 1 - along;
    return {
      x: (rest * rest * start.x) + (2 * rest * along * stroke.control.x) + (along * along * stroke.end.x),
      y: (rest * rest * start.y) + (2 * rest * along * stroke.control.y) + (along * along * stroke.end.y),
    };
  },

  /** The start and every step's end along the strokes, each stroke as this many straight steps. */
  pointsOfStrokes: (start: Point, strokes: readonly QuadraticStroke[], stepsPerStroke: number): readonly Point[] => {
    const points: Point[] = [start];
    let strokeStart = start;
    for (const stroke of strokes) {
      for (let i = 1; i <= stepsPerStroke; i++) points.push(TracedPathUtil.quadraticPointOf(strokeStart, stroke, i / stepsPerStroke));
      strokeStart = stroke.end;
    }
    return points;
  },

  /** The part of the line through the points up to this share of its length; its last point is where the share ends. */
  leadingShareOf: (points: readonly Point[], share: number): readonly Point[] => {
    const totalLength = points.slice(1).reduce((length, point, i) => length + distanceBetween(points[i] ?? point, point), 0);
    let lengthLeft = totalLength * AnimationCurveUtil.clamp(share);
    const kept: Point[] = points.slice(0, 1);
    for (const [i, point] of points.slice(1).entries()) {
      const previous = points[i] ?? point;
      const stepLength = distanceBetween(previous, point);
      if (lengthLeft >= stepLength) {
        kept.push(point);
        lengthLeft -= stepLength;
      } else {
        const along = lengthLeft / stepLength;
        if (along > 0) kept.push({ x: previous.x + ((point.x - previous.x) * along), y: previous.y + ((point.y - previous.y) * along) });
        break;
      }
    }
    return kept;
  },

  /** Straight steps through the points; no point is no path. */
  pathDataOf: (points: readonly Point[]): string => points
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${SvgTextUtil.numberText(point.x)} ${SvgTextUtil.numberText(point.y)}`)
    .join(' '),
});
