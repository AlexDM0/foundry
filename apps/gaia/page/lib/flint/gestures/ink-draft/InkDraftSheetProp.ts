/**
 * The sheet of Ink the draft: a draft with three dashed lines, the solid outline the pen leaves behind it, and,
 * once inked, the ready ticket with its header, a short pop and two small sparks from its top corners.
 */
import type { Point }                                         from '../../SpriteGeometry.ts';
import type { Shape }                                         from '../../drawing/Shape.ts';
import { propDefinition }                                     from '../../props/PropDefinition.ts';
import { PaperShapeUtil }                                     from '../../props/shapes/PaperShapeUtil.ts';
import { SparkShapeUtil }                                     from '../../props/shapes/SparkShapeUtil.ts';
import { TracedPathUtil }                                     from '../../props/shapes/TracedPathUtil.ts';
import { writtenLineShapeOf }                                 from '../../props/shapes/WrittenLineShape.ts';
import { PAPER_SHAPE }                                        from '../../props/shapes/constants/SharedShapes.ts';
import { INK_DRAFT_SHEET, INK_DRAFT_SPARKS, INK_DRAFT_TRACE } from './constants/InkDraftValues.ts';

export interface InkDraftSheetState {
  readonly shown:         number;
  /** Multiplies the opacity: the fade in and out of one sheet in its cycle. */
  readonly cycleOpacity:  number;
  /** The outline the pen has gone around: the start corner, each corner passed, and the pen's tip. */
  readonly tracedPoints:  readonly Point[];
  readonly isInked:       boolean;
  readonly headerOpacity: number;
  /** Scales the sheet around its centre: the pop of the moment it is inked. */
  readonly scale:         number;
  /** From 0 to 1 over the flight of the two sparks; they show only between. */
  readonly sparkFlight:   number;
  readonly offsetX:       number;
  readonly offsetY:       number;
}

function tracedOutlineOf(points: readonly Point[]): Shape {
  return {
    kind:        'path',
    key:         'traced-outline',
    pathData:    TracedPathUtil.pathDataOf(points),
    fill:        'none',
    stroke:      'paperEdge',
    strokeWidth: INK_DRAFT_TRACE.STROKE_UNITS,
    lineCap:     'round',
    lineJoin:    'round',
    opacity:     points.length > 1 ? 1 : 0,
  };
}

/** The top left and the top right corner of the paper, each with the way its spark flies. */
function sparkShapesOf(flight: number): readonly Shape[] {
  return INK_DRAFT_SPARKS.ANGLES_DEGREES.map((angleDegrees, i): Shape => SparkShapeUtil.smallSparkOf({
    key: `spark-${i}`,
    ...SparkShapeUtil.flyingSparkPlaceOf({
      origin:      PAPER_SHAPE.POINTS[i] ?? { x: PAPER_SHAPE.CENTRE_X_UNITS, y: PAPER_SHAPE.CENTRE_Y_UNITS },
      angleDegrees,
      travelUnits: INK_DRAFT_SPARKS.TRAVEL_UNITS,
      flight,
    }),
  }));
}

export const INK_DRAFT_SHEET_PROP = propDefinition({
  name:   'inkDraftSheet',
  hidden: Object.freeze<InkDraftSheetState>({
    shown:         0,
    cycleOpacity:  1,
    tracedPoints:  Object.freeze([]),
    isInked:       false,
    headerOpacity: 0,
    scale:         1,
    sparkFlight:   0,
    offsetX:       0,
    offsetY:       0,
  }),
  layer:    'behind-body',
  shapesOf: (state: InkDraftSheetState, context) => ({
    opacity:   state.shown * state.cycleOpacity,
    transform: [
      { translateX: state.offsetX + PAPER_SHAPE.CENTRE_X_UNITS, translateY: state.offsetY + PAPER_SHAPE.CENTRE_Y_UNITS },
      { scaleX: state.scale, scaleY: state.scale },
      { translateX: -PAPER_SHAPE.CENTRE_X_UNITS, translateY: -PAPER_SHAPE.CENTRE_Y_UNITS },
    ],
    shapes: [
      PaperShapeUtil.paperOf({ key: 'paper', isDraft: !state.isInked }),
      { ...PaperShapeUtil.headerOf('header'), opacity: state.headerOpacity },
      ...INK_DRAFT_SHEET.LINE_Y_UNITS.map((lineY, i): Shape => ({
        ...writtenLineShapeOf({
          key:           `line-${i}`,
          startX:        INK_DRAFT_SHEET.LINE_START_X_UNITS,
          startY:        lineY,
          fullLength:    INK_DRAFT_SHEET.FULL_LINE_UNITS,
          writtenLength: INK_DRAFT_SHEET.FULL_LINE_UNITS,
          facing:        context.facing,
        }),
        ...(state.isInked ? {} : { dash: [PAPER_SHAPE.DRAFT_DASH_UNITS, PAPER_SHAPE.DRAFT_GAP_UNITS] }),
      })),
      tracedOutlineOf(state.tracedPoints),
      ...sparkShapesOf(state.sparkFlight),
    ],
  }),
});
