/**
 * The book of the research gesture is drawn turned and lowered (`02-animations.md`, "Book placement"); its values are in the book's own
 * coordinates before that turn and move. This gives its points in Flint's own units, and the outer edge of the page that turns.
 */
import type { Point }         from '../../SpriteGeometry.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import { BOOK_SHAPE }         from './constants/ResearchValues.ts';

export interface PageEdge {
  readonly x:    number;
  readonly topY: number;
}

/** A book point after the book's turn of `BOOK_SHAPE.TILT_DEGREES` clockwise around its tilt centre, and its drop. */
function pointOnBook(bookPoint: Point): Point {
  const angle = AnimationCurveUtil.radiansOf(BOOK_SHAPE.TILT_DEGREES);
  const fromCentreX = bookPoint.x - BOOK_SHAPE.TILT_CENTRE_X_UNITS;
  const fromCentreY = bookPoint.y - BOOK_SHAPE.TILT_CENTRE_Y_UNITS;
  return {
    x: BOOK_SHAPE.TILT_CENTRE_X_UNITS + (fromCentreX * Math.cos(angle)) - (fromCentreY * Math.sin(angle)),
    y: BOOK_SHAPE.TILT_CENTRE_Y_UNITS + (fromCentreX * Math.sin(angle)) + (fromCentreY * Math.cos(angle)) + BOOK_SHAPE.DROP_UNITS,
  };
}

/** The outer edge of the turning page at a spread (already multiplied by the facing), in book coordinates: it rises as the page stands up. */
function turningPageEdgeOf(pageSpread: number): PageEdge {
  return {
    x:    BOOK_SHAPE.SPINE_X_UNITS + (BOOK_SHAPE.PAGE_WIDTH_UNITS * pageSpread),
    topY: BOOK_SHAPE.PAGE_TOP_Y_UNITS - (BOOK_SHAPE.PAGE_RISE_UNITS * (1 - Math.abs(pageSpread))),
  };
}

export const BookGeometryUtil = Object.freeze({ pointOnBook, turningPageEdgeOf });
