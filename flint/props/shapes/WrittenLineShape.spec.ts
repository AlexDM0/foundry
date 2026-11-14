/**
 * A written line. What matters: it grows from its left end on the screen, so facing left it starts at the far end of the paper in
 * Flint's own coordinates; it goes down with the slope of the paper; an unwritten line shows nothing.
 */
import { expect, test } from 'bun:test';

import { writtenLineShapeOf } from './WrittenLineShape.ts';

const lineOf = (writtenLength: number, facing: 1 | -1) => writtenLineShapeOf({
  key: 'line', startX: 31, startY: -34, fullLength: 12, writtenLength, facing,
});

test('facing right, it grows from its start with the slope of the paper', () => {
  expect(lineOf(6, 1)).toMatchObject({
    x1: 31, y1: -34, x2: 37, y2: -32.8, stroke: 'paperEdge', strokeWidth: 1.5, lineCap: 'round', opacity: 1,
  });
});

test('facing left, it grows from the far end of the paper, which is its left end on the screen', () => {
  const line = lineOf(6, -1);
  expect([line.kind === 'line' ? line.x1 : 0, line.kind === 'line' ? line.x2 : 0]).toEqual([43, 37]);
});

test('an unwritten line shows nothing', () => {
  expect(lineOf(0, 1).opacity).toBe(0);
});
