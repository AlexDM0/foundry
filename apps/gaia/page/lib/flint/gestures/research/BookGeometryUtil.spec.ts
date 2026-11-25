/**
 * The book's geometry. What matters: the book is turned 20 degrees clockwise
 * around (39, -27), then dropped 11 and held 3 nearer to Flint, with no skew; and the turning page's outer edge is at x = 39 + 10.5k,
 * its top rising by 3 as the page stands upright.
 */
import { expect, test } from 'bun:test';

import { BookGeometryUtil } from './BookGeometryUtil.ts';

const TILT_RADIANS = (20 * Math.PI) / 180;

test('the tilt centre only drops by 11 and comes 3 nearer', () => {
  expect(BookGeometryUtil.pointOnBook({ x: 39, y: -27 })).toEqual({ x: 36, y: -16 });
});

test('the book turns clockwise on the screen: a point right of the centre moves down', () => {
  const turned = BookGeometryUtil.pointOnBook({ x: 49, y: -27 });
  expect(turned.x).toBeCloseTo(36 + (10 * Math.cos(TILT_RADIANS)));
  expect(turned.y).toBeCloseTo(-27 + (10 * Math.sin(TILT_RADIANS)) + 11);
});

test('the turn keeps distances: it is a rotation with no skew', () => {
  const first = BookGeometryUtil.pointOnBook({ x: 27, y: -41 });
  const second = BookGeometryUtil.pointOnBook({ x: 51, y: -16.5 });
  expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeCloseTo(Math.hypot(24, 24.5));
});

test('the turning page\'s edge lies flat at a spread of 1 and -1 and stands 3 higher at a spread of 0', () => {
  expect(BookGeometryUtil.turningPageEdgeOf(1)).toEqual({ x: 49.5, topY: -41.5 });
  expect(BookGeometryUtil.turningPageEdgeOf(0)).toEqual({ x: 39, topY: -44.5 });
  expect(BookGeometryUtil.turningPageEdgeOf(-1)).toEqual({ x: 28.5, topY: -41.5 });
});
