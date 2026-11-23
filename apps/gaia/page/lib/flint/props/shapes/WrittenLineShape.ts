/**
 * A written line of the shared vocabulary: it grows
 * from its left end on the screen, so facing left it starts at the far end of the paper in Flint's own coordinates, and it goes down with
 * the slope of the paper.
 */
import type { Facing }                     from '../../SpriteGeometry.ts';
import type { FlintColourRole }            from '../../constants/Palette.ts';
import type { Shape }                      from '../../drawing/Shape.ts';
import { PAPER_SHAPE, WRITTEN_LINE_SHAPE } from './constants/SharedShapes.ts';

export interface WrittenLineOptions {
  readonly key:           string;
  readonly startX:        number;
  readonly startY:        number;
  readonly fullLength:    number;
  readonly writtenLength: number;
  readonly facing:        Facing;
  readonly strokeWidth?:  number;
  readonly stroke?:       FlintColourRole;
  /** The paper's slope by default. */
  readonly slope?:        number;
}

export function writtenLineShapeOf(options: WrittenLineOptions): Shape {
  const slope = options.slope ?? PAPER_SHAPE.SLOPE;
  const from = options.facing === 1 ? 0 : options.fullLength;
  const to = options.facing === 1 ? options.writtenLength : options.fullLength - options.writtenLength;
  return {
    kind:        'line',
    key:         options.key,
    x1:          options.startX + from,
    y1:          options.startY + (slope * from),
    x2:          options.startX + to,
    y2:          options.startY + (slope * to),
    stroke:      options.stroke ?? 'paperEdge',
    strokeWidth: options.strokeWidth ?? WRITTEN_LINE_SHAPE.STROKE_UNITS,
    lineCap:     'round',
    opacity:     options.writtenLength > 0 ? 1 : 0,
  };
}
