/**
 * The sheet of Waiver: the sheet of Review with its cross, the initials Flint writes beside the cross, and the
 * grey tick the cross becomes. The cross turns grey as a cross-fade of a crimson and a grey cross, since a colour role does not blend.
 * The initials, the cross and the tick are never mirrored.
 */
import type { Shape }         from '../../drawing/Shape.ts';
import { propDefinition }     from '../../props/PropDefinition.ts';
import { PaperShapeUtil }     from '../../props/shapes/PaperShapeUtil.ts';
import { sheetLineShapesOf }  from '../../props/shapes/SheetLinesShape.ts';
import { TracedPathUtil }     from '../../props/shapes/TracedPathUtil.ts';
import { VerdictShapeUtil }   from '../../props/shapes/VerdictShapeUtil.ts';
import { SHEET_SHAPE }        from '../../props/shapes/constants/SheetShape.ts';
import { WaiverInitialsUtil } from './WaiverInitialsUtil.ts';
import { WAIVER_INITIALS }    from './constants/WaiverValues.ts';

export interface WaiverSheetState {
  readonly shown:        number;
  /** Multiplies the opacity: the fade in and out of the sheet in its cycle. */
  readonly cycleOpacity: number;
  /** The share of the initials' length that is written. */
  readonly writtenShare: number;
  /** From 0, the cross in crimson, to 1, the cross in grey. */
  readonly greyed:       number;
  /** From 0, the cross, to 1, the grey tick in its place. */
  readonly waived:       number;
}

function verdictShapesOf(state: WaiverSheetState): readonly Shape[] {
  const crossPlace = { startX: SHEET_SHAPE.CROSS_START_X_UNITS, startY: SHEET_SHAPE.CROSS_START_Y_UNITS };
  const crossOpacity = 1 - state.waived;
  return [
    VerdictShapeUtil.crossOf({ key: 'cross', ...crossPlace, opacity: crossOpacity * (1 - state.greyed) }),
    VerdictShapeUtil.crossOf({
      key: 'grey-cross', ...crossPlace, opacity: crossOpacity * state.greyed, colour: 'paperEdge',
    }),
    VerdictShapeUtil.tickOf({
      key: 'grey-tick', startX: SHEET_SHAPE.TICK_START_X_UNITS, startY: SHEET_SHAPE.TICK_START_Y_UNITS, opacity: state.waived, colour: 'paperEdge',
    }),
  ];
}

function initialsShapeOf(writtenShare: number): Shape {
  return {
    kind:             'path',
    key:              'initials',
    pathData:         TracedPathUtil.pathDataOf(WaiverInitialsUtil.writtenPointsOf(writtenShare)),
    fill:             'none',
    stroke:           'graphite',
    strokeWidth:      WAIVER_INITIALS.STROKE_UNITS,
    lineCap:          'round',
    lineJoin:         'round',
    opacity:          writtenShare > 0 ? 1 : 0,
    unmirroredAboutX: WaiverInitialsUtil.mirrorAxisX(),
  };
}

export const WAIVER_SHEET_PROP = propDefinition({
  name:   'waiverSheet',
  hidden: Object.freeze<WaiverSheetState>({
    shown: 0, cycleOpacity: 1, writtenShare: 0, greyed: 0, waived: 0,
  }),
  layer:    'behind-body',
  shapesOf: (state: WaiverSheetState) => ({
    opacity: state.shown * state.cycleOpacity,
    shapes:  [
      PaperShapeUtil.paperOf({ key: 'paper' }),
      ...sheetLineShapesOf(null),
      ...verdictShapesOf(state),
      initialsShapeOf(state.writtenShare),
    ],
  }),
});
