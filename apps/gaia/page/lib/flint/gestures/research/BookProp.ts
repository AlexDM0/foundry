/**
 * The open book of Research, turned and lowered so that it slants to Flint, with the page that turns between the
 * text and the spine. Its values are in the book's own coordinates before that turn and drop.
 */
import type { Shape }       from '../../drawing/Shape.ts';
import { propDefinition }   from '../../props/PropDefinition.ts';
import { BookGeometryUtil } from './BookGeometryUtil.ts';
import { BOOK_SHAPE }       from './constants/ResearchValues.ts';

export interface BookState {
  readonly shown:             number;
  /** The signed fraction of the page width from the spine to the turning page's edge, times the facing; null turns no page. */
  readonly turningPageSpread: number | null;
}

function turningPageShapesOf(state: BookState): readonly Shape[] {
  if (state.turningPageSpread === null) return [];
  const edge = BookGeometryUtil.turningPageEdgeOf(state.turningPageSpread);
  return [{
    kind:   'polygon',
    key:    'turning-page',
    points: [
      { x: BOOK_SHAPE.SPINE_X_UNITS, y: BOOK_SHAPE.SPINE_TOP_Y_UNITS },
      { x: edge.x, y: edge.topY },
      { x: edge.x, y: edge.topY + BOOK_SHAPE.PAGE_HEIGHT_UNITS },
      { x: BOOK_SHAPE.SPINE_X_UNITS, y: BOOK_SHAPE.SPINE_BOTTOM_Y_UNITS },
    ],
    fill:        'paper',
    stroke:      'paperText',
    strokeWidth: BOOK_SHAPE.PAGE_STROKE_UNITS,
    lineJoin:    'round',
    opacity:     1,
  }];
}

export const BOOK_PROP = propDefinition({
  name:     'book',
  hidden:   Object.freeze<BookState>({ shown: 0, turningPageSpread: null }),
  layer:    'behind-body',
  shapesOf: (state: BookState) => ({
    opacity:   state.shown,
    transform: [
      { translateX: 0, translateY: BOOK_SHAPE.DROP_UNITS },
      { rotateDegrees: BOOK_SHAPE.TILT_DEGREES, aboutX: BOOK_SHAPE.TILT_CENTRE_X_UNITS, aboutY: BOOK_SHAPE.TILT_CENTRE_Y_UNITS },
    ],
    shapes: [
      {
        kind: 'polygon', key: 'cover', points: BOOK_SHAPE.COVER_POINTS, fill: 'hand', stroke: 'hand', strokeWidth: BOOK_SHAPE.COVER_STROKE_UNITS, lineJoin: 'round',
      },
      {
        kind: 'polygon', key: 'bookmark', points: BOOK_SHAPE.BOOKMARK_POINTS, fill: 'body',
      },
      {
        kind: 'path', key: 'pages-below', pathData: BOOK_SHAPE.PAGES_BELOW_PATH, fill: 'none', stroke: 'paperFold', strokeWidth: BOOK_SHAPE.PAGES_BELOW_STROKE_UNITS,
      },
      {
        kind: 'path', key: 'left-page', pathData: BOOK_SHAPE.LEFT_PAGE_PATH, fill: 'paper', stroke: 'paperText', strokeWidth: BOOK_SHAPE.PAGE_STROKE_UNITS, lineJoin: 'round',
      },
      {
        kind: 'path', key: 'right-page', pathData: BOOK_SHAPE.RIGHT_PAGE_PATH, fill: 'paper', stroke: 'paperText', strokeWidth: BOOK_SHAPE.PAGE_STROKE_UNITS, lineJoin: 'round',
      },
      {
        kind: 'path', key: 'text', pathData: BOOK_SHAPE.TEXT_PATH, fill: 'none', stroke: 'paperText', strokeWidth: BOOK_SHAPE.TEXT_STROKE_UNITS, lineCap: 'round',
      },
      ...turningPageShapesOf(state),
      {
        kind: 'path', key: 'spine', pathData: BOOK_SHAPE.SPINE_PATH, fill: 'none', stroke: 'paperFold', strokeWidth: BOOK_SHAPE.SPINE_STROKE_UNITS,
      },
    ],
  }),
});
