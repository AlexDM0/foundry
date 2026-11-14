/** The bug of the shared vocabulary (`06-more-animations.md`): a finding, a hexagon with four legs that wiggles. */
import type { Point }         from '../../SpriteGeometry.ts';
import { HAND_SHAPE, ANGLE }  from '../../constants/HandShape.ts';
import type { Shape }         from '../../drawing/Shape.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import { BUG_SHAPE }          from './constants/SharedShapes.ts';

export interface BugOptions {
  readonly key:         string;
  readonly centreX:     number;
  readonly centreY:     number;
  /** Its wiggle, `BugShapeUtil.wiggleDegreesAt(t)`; 0 holds it still. */
  readonly turnDegrees: number;
  readonly opacity?:    number;
}

function pointAt(centre: Point, distance: number, degrees: number): Point {
  const angle = AnimationCurveUtil.radiansOf(degrees);
  return { x: centre.x + (Math.cos(angle) * distance), y: centre.y + (Math.sin(angle) * distance) };
}

export const BugShapeUtil = Object.freeze({
  bugOf: (options: BugOptions): readonly Shape[] => {
    const centre = { x: options.centreX, y: options.centreY };
    const style = {
      transform: [{ rotateDegrees: options.turnDegrees, aboutX: centre.x, aboutY: centre.y }],
      ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
    };
    const corners = Array.from({ length: BUG_SHAPE.CORNER_COUNT }, (_unused, i) => pointAt(
      centre, BUG_SHAPE.RADIUS_UNITS, HAND_SHAPE.FIRST_CORNER_OFFSET_DEGREES + (i * ANGLE.FULL_TURN_DEGREES / BUG_SHAPE.CORNER_COUNT),
    ));
    const legs = BUG_SHAPE.LEG_ANGLES_DEGREES.map((degrees, i): Shape => {
      const start = pointAt(centre, BUG_SHAPE.RADIUS_UNITS, degrees);
      const end = pointAt(centre, BUG_SHAPE.RADIUS_UNITS + BUG_SHAPE.LEG_LENGTH_UNITS, degrees);
      return {
        kind:        'line',
        key:         `${options.key}-leg-${i}`,
        x1:          start.x,
        y1:          start.y,
        x2:          end.x,
        y2:          end.y,
        stroke:      'alarm',
        strokeWidth: BUG_SHAPE.LEG_STROKE_UNITS,
        lineCap:     'round',
        ...style,
      };
    });
    return [...legs, {
      kind: 'polygon', key: options.key, points: corners, fill: 'alarm', ...style,
    }];
  },

  wiggleDegreesAt: (elapsedMilliseconds: number): number => BUG_SHAPE.WIGGLE_DEGREES * Math.sin(elapsedMilliseconds / BUG_SHAPE.WIGGLE_DIVISOR_MILLISECONDS),
});
