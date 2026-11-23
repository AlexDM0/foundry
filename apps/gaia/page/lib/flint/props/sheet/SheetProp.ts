/**
 * The floating sheet of Review, which Bug jar shares: its loose pile of stacked pages, its four lines with the one
 * Flint reads in the body colour, and the verdict above it. It slides in from the side away from Flint as it fades in.
 */
import type { Shape }                 from '../../drawing/Shape.ts';
import { propDefinition }             from '../PropDefinition.ts';
import { PaperShapeUtil }             from '../shapes/PaperShapeUtil.ts';
import { sheetLineShapesOf }          from '../shapes/SheetLinesShape.ts';
import { VerdictShapeUtil }           from '../shapes/VerdictShapeUtil.ts';
import { PAPER_SHAPE }                from '../shapes/constants/SharedShapes.ts';
import { SHEET_SHAPE, STACKED_PAGES } from '../shapes/constants/SheetShape.ts';

export type StackedPageCount = 0 | 1 | 2 | 3;

export type ReviewVerdict = 'tick' | 'cross';

export interface SheetState {
  readonly shown:            number;
  /** The line Flint reads, drawn in the body colour; null reads none. */
  readonly readLineIndex:    number | null;
  readonly stackedPageCount: StackedPageCount;
  /** Positive is down: the page turn of busy review, the jab of angry review. */
  readonly offsetY:          number;
  readonly verdict:          ReviewVerdict | null;
}

/** The farthest page is drawn first; page n shows while the count is above n. */
function stackedPageShapesOf(state: SheetState): readonly Shape[] {
  return STACKED_PAGES.map((page, i): Shape => ({
    kind:        'polygon',
    key:         `stacked-page-${i}`,
    points:      PAPER_SHAPE.POINTS,
    fill:        'paperStacked',
    stroke:      'paperText',
    strokeWidth: SHEET_SHAPE.STACKED_PAGE_STROKE_UNITS,
    lineJoin:    'round',
    opacity:     i < state.stackedPageCount ? 1 : 0,
    transform:   [
      { translateX: page.OFFSET_X_UNITS, translateY: page.OFFSET_Y_UNITS },
      { rotateDegrees: page.TURN_DEGREES, aboutX: SHEET_SHAPE.STACKED_PAGE_TURN_CENTRE_X_UNITS, aboutY: SHEET_SHAPE.STACKED_PAGE_TURN_CENTRE_Y_UNITS },
    ],
  })).reverse();
}

export const SHEET_PROP = propDefinition({
  name:   'sheet',
  hidden: Object.freeze<SheetState>({
    shown: 0, readLineIndex: null, stackedPageCount: 0, offsetY: 0, verdict: null,
  }),
  layer:    'behind-body',
  shapesOf: (state: SheetState) => ({
    opacity:   state.shown,
    transform: [{ translateX: (1 - state.shown) * SHEET_SHAPE.SLIDE_UNITS, translateY: state.offsetY }],
    shapes:    [
      ...stackedPageShapesOf(state),
      PaperShapeUtil.paperOf({ key: 'paper' }),
      ...sheetLineShapesOf(state.readLineIndex),
      VerdictShapeUtil.tickOf({
        key: 'tick', startX: SHEET_SHAPE.TICK_START_X_UNITS, startY: SHEET_SHAPE.TICK_START_Y_UNITS, opacity: state.verdict === 'tick' ? 1 : 0,
      }),
      VerdictShapeUtil.crossOf({
        key: 'cross', startX: SHEET_SHAPE.CROSS_START_X_UNITS, startY: SHEET_SHAPE.CROSS_START_Y_UNITS, opacity: state.verdict === 'cross' ? 1 : 0,
      }),
    ],
  }),
});
