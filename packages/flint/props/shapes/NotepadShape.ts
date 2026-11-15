/** The notepad of Research (`01-character.md`), which Interview shares: the paper, its binding of dots, and the lines Flint writes. */
import type { Facing }        from '../../SpriteGeometry.ts';
import type { Shape }         from '../../drawing/Shape.ts';
import { writtenLineShapeOf } from './WrittenLineShape.ts';
import { NOTEPAD_SHAPE }      from './constants/NotepadShape.ts';

export interface NotepadOptions {
  /** A written length per line, in units; a written line grows from its left end on the screen. */
  readonly writtenLengths: readonly number[];
  readonly facing:         Facing;
  /** The written lines can fade while the paper stays; 1 by default. */
  readonly linesOpacity?:  number;
}

export function notepadShapesOf(options: NotepadOptions): readonly Shape[] {
  const linesOpacity = options.linesOpacity ?? 1;
  return [
    {
      kind: 'polygon', key: 'paper', points: NOTEPAD_SHAPE.POINTS, fill: 'paper', stroke: 'paperEdge', strokeWidth: NOTEPAD_SHAPE.STROKE_UNITS, lineJoin: 'round',
    },
    {
      kind:        'path',
      key:         'binding',
      pathData:    NOTEPAD_SHAPE.BINDING_PATH,
      fill:        'none',
      stroke:      'graphite',
      strokeWidth: NOTEPAD_SHAPE.BINDING_STROKE_UNITS,
      dash:        [NOTEPAD_SHAPE.BINDING_DASH_UNITS, NOTEPAD_SHAPE.BINDING_GAP_UNITS],
      lineCap:     'round',
    },
    ...NOTEPAD_SHAPE.LINE_Y_UNITS.map((lineY, i): Shape => {
      const line = writtenLineShapeOf({
        key:           `line-${i}`,
        startX:        NOTEPAD_SHAPE.LINE_START_X_UNITS,
        startY:        lineY,
        fullLength:    NOTEPAD_SHAPE.FULL_LINE_UNITS,
        writtenLength: options.writtenLengths[i] ?? 0,
        facing:        options.facing,
      });
      return linesOpacity === 1 ? line : { ...line, opacity: (line.opacity ?? 1) * linesOpacity };
    }),
  ];
}
