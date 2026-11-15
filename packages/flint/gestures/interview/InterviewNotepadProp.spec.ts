/**
 * The notepad of Interview. What matters: the paper, its binding, three lines and the tick; a line shows only once written, at the lines'
 * opacity, so the lines fade while the notepad stays; facing left a line grows from the far end in Flint's own units.
 */
import { expect, test } from 'bun:test';

import { INTERVIEW_NOTEPAD_PROP } from './InterviewNotepadProp.ts';

test('the paper, the binding, the written lines at their opacity, and the tick', () => {
  const drawing = INTERVIEW_NOTEPAD_PROP.shapesOf({
    shown: 1, writtenLengths: [10, 5, 0], linesOpacity: 0.5, tickOpacity: 0.5,
  }, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['paper', 'binding', 'line-0', 'line-1', 'line-2', 'tick']);
  expect(drawing.shapes.map((shape) => shape.opacity)).toEqual([undefined, undefined, 0.5, 0.5, 0, 0.5]);
  expect(drawing.opacity).toBe(1);
});

test('facing left, a half written line runs from the far half of its place in Flint\'s units', () => {
  const drawing = INTERVIEW_NOTEPAD_PROP.shapesOf({
    shown: 1, writtenLengths: [5, 0, 0], linesOpacity: 1, tickOpacity: 0,
  }, { facing: -1, holdingHand: null });
  expect(drawing.shapes.find((shape) => shape.key === 'line-0')).toMatchObject({ x1: 43, x2: 38 });
});
