/**
 * The bar of Lay the bar. What matters: the faint row line from (-50, 3) to (30, 3); the bar ends at x -18 and grows away from Flint, 6
 * high with a corner of 3; and its 6 units nearest Flint are the body colour, flat on the bar's side and round on Flint's.
 */
import { expect, test } from 'bun:test';

import { LAY_BAR_PROP } from './LayBarProp.ts';

const SHAPES = LAY_BAR_PROP.shapesOf({ shown: 1, barLength: 20, barOpacity: 0.5 }, { facing: 1, holdingHand: null }).shapes;

test('the row line, then the bar, then its head', () => {
  expect(SHAPES.map((shape) => shape.key)).toEqual(['row', 'bar', 'bar-head']);
  expect(SHAPES[0]).toMatchObject({
    x1: -50, y1: 3, x2: 30, y2: 3, stroke: 'graphite', strokeWidth: 0.6, opacity: 0.3,
  });
});

test('the bar runs from -(18 + length) to -18, at y -4, 6 high with a corner of 3', () => {
  expect(SHAPES[1]).toEqual({
    kind: 'rectangle', key: 'bar', x: -38, y: -4, width: 20, height: 6, cornerRadius: 3, fill: 'emberLight', opacity: 0.5,
  });
});

test('the head is the 6 units nearest Flint, in the body colour, rounded towards Flint', () => {
  expect(SHAPES[2]).toEqual({
    kind: 'path', key: 'bar-head', pathData: 'M-24 -4 H-21 A3 3 0 0 1 -21 2 H-24Z', fill: 'body', opacity: 0.5,
  });
});
