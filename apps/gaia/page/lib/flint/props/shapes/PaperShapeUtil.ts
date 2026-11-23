/** The paper of the shared vocabulary: a sheet or ticket, a draft with a dashed outline, its header, the mini sheet. */
import type { Point }                from '../../SpriteGeometry.ts';
import type { FlintColourRole }      from '../../constants/Palette.ts';
import type { Shape, TransformStep } from '../../drawing/Shape.ts';
import { PAPER_SHAPE }               from './constants/SharedShapes.ts';

export interface PaperOptions {
  readonly key:      string;
  /** A draft has a dashed outline and a fill that lets the ground through; a ready ticket is solid. */
  readonly isDraft?: boolean;
}

export const PaperShapeUtil = Object.freeze({
  paperOf: (options: PaperOptions): Shape => ({
    kind:        'polygon',
    key:         options.key,
    points:      PAPER_SHAPE.POINTS,
    fill:        'paper',
    stroke:      'paperEdge',
    strokeWidth: PAPER_SHAPE.STROKE_UNITS,
    lineJoin:    'round',
    ...(options.isDraft === true ? { dash: [PAPER_SHAPE.DRAFT_DASH_UNITS, PAPER_SHAPE.DRAFT_GAP_UNITS], fillOpacity: PAPER_SHAPE.DRAFT_FILL_OPACITY } : {}),
  }),

  /** The header of a ready ticket, in the body colour; a ticket that waits has a grey one. */
  headerOf: (key: string, fill: FlintColourRole = 'body'): Shape => ({
    kind: 'polygon', key, points: PAPER_SHAPE.HEADER_POINTS, fill,
  }),

  /** Scales the paper around its own centre, and moves that centre to the point given. */
  scaledPaperTransformOf: (centre: Point, scale: number): readonly TransformStep[] => [
    { translateX: centre.x, translateY: centre.y },
    { scaleX: scale, scaleY: scale },
    { translateX: -PAPER_SHAPE.CENTRE_X_UNITS, translateY: -PAPER_SHAPE.CENTRE_Y_UNITS },
  ],

  /** Scales the paper to the mini sheet around its own centre, and moves that centre to the point given. */
  miniSheetTransformOf: (centre: Point): readonly TransformStep[] => PaperShapeUtil.scaledPaperTransformOf(centre, PAPER_SHAPE.MINI_SHEET_SCALE),
});
