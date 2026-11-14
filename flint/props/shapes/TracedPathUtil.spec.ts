/**
 * A path that grows along its length. What matters: a quadratic curve by its formula; strokes chain from the end of the one before, as
 * straight steps; the leading share is measured by length, ends inside a step where the share ends, and is the start alone at 0; and the
 * path data goes straight through the points.
 */
import { expect, test } from 'bun:test';

import { TracedPathUtil } from './TracedPathUtil.ts';

const STROKE = { control: { x: 2, y: -4 }, end: { x: 4, y: 0 } };

test('a point on a quadratic curve, and strokes as straight steps that chain', () => {
  expect(TracedPathUtil.quadraticPointOf({ x: 0, y: 0 }, STROKE, 0.5)).toEqual({ x: 2, y: -2 });
  const points = TracedPathUtil.pointsOfStrokes({ x: 0, y: 0 }, [STROKE, { control: { x: 6, y: 4 }, end: { x: 8, y: 0 } }], 2);
  expect(points).toEqual([{ x: 0, y: 0 }, { x: 2, y: -2 }, { x: 4, y: 0 }, { x: 6, y: 2 }, { x: 8, y: 0 }]);
});

test('the leading share is measured along the length', () => {
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  expect(TracedPathUtil.leadingShareOf(line, 0)).toEqual([{ x: 0, y: 0 }]);
  expect(TracedPathUtil.leadingShareOf(line, 0.25)).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }]);
  expect(TracedPathUtil.leadingShareOf(line, 0.75)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
  expect(TracedPathUtil.leadingShareOf(line, 1)).toEqual(line);
});

test('the path data goes straight through the points', () => {
  expect(TracedPathUtil.pathDataOf([{ x: 0, y: 0 }, { x: 10, y: -2.5 }])).toBe('M0 0 L10 -2.5');
  expect(TracedPathUtil.pathDataOf([])).toBe('');
});
