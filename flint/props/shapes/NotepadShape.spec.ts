/**
 * The notepad. What matters: the paper, then the dotted binding, then three lines from x 33 at y -33, -28 and -23, each shown once written
 * and growing from its left end on the screen; the written lines can fade while the paper stays.
 */
import { expect, test } from 'bun:test';

import { notepadShapesOf } from './NotepadShape.ts';

test('the paper, the binding and the written lines', () => {
  const shapes = notepadShapesOf({ writtenLengths: [10, 4, 0], facing: 1 });
  expect(shapes.map((shape) => shape.key)).toEqual(['paper', 'binding', 'line-0', 'line-1', 'line-2']);
  expect(shapes[3]).toMatchObject({
    x1: 33, y1: -28, x2: 37, opacity: 1,
  });
  expect(shapes[4]?.opacity).toBe(0);
});

test('the written lines fade while the paper stays', () => {
  const shapes = notepadShapesOf({ writtenLengths: [10, 0, 0], facing: -1, linesOpacity: 0.5 });
  expect([shapes[0]?.opacity, shapes[2]?.opacity, shapes[3]?.opacity]).toEqual([undefined, 0.5, 0]);
  expect(shapes[2]).toMatchObject({ x1: 43, x2: 33 });
});
