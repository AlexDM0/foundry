/**
 * The fuse of Incident fuse as straight steps along its two curves, measured by length: the part that has not burned runs from the
 * envelope to the point the burn has reached, and the flame sits at that point. The fuse burns from its free end, at an even pace.
 */
import type { Point }     from '../../SpriteGeometry.ts';
import { TracedPathUtil } from '../../props/shapes/TracedPathUtil.ts';
import { FUSE_SHAPE }     from './constants/IncidentFuseValues.ts';

const FUSE_START: Point = Object.freeze({ x: FUSE_SHAPE.START_X_UNITS, y: FUSE_SHAPE.START_Y_UNITS });

/** Every step's end from the envelope to the free end, the envelope's corner first. */
const FUSE_POINTS = TracedPathUtil.pointsOfStrokes(FUSE_START, [
  { control: { x: FUSE_SHAPE.FIRST_CONTROL_X_UNITS, y: FUSE_SHAPE.FIRST_CONTROL_Y_UNITS }, end: { x: FUSE_SHAPE.FIRST_END_X_UNITS, y: FUSE_SHAPE.FIRST_END_Y_UNITS } },
  { control: { x: FUSE_SHAPE.SECOND_CONTROL_X_UNITS, y: FUSE_SHAPE.SECOND_CONTROL_Y_UNITS }, end: { x: FUSE_SHAPE.FREE_END_X_UNITS, y: FUSE_SHAPE.FREE_END_Y_UNITS } },
], FUSE_SHAPE.STEPS_PER_CURVE);

/** The points of the part that has not burned, from the envelope; its last point is where the burn has reached. */
function unburnedPointsOf(burn: number): readonly Point[] {
  return TracedPathUtil.leadingShareOf(FUSE_POINTS, 1 - burn);
}

export const FusePathUtil = Object.freeze({
  /** The path of the part that has not burned; at a full burn it is the envelope's corner alone. */
  unburnedPathOf: (burn: number): string => TracedPathUtil.pathDataOf(unburnedPointsOf(burn)),

  /** Where the flame burns: the end of the part that has not burned. */
  flamePointOf: (burn: number): Point => {
    const points = unburnedPointsOf(burn);
    return points[points.length - 1] ?? FUSE_START;
  },
});
