/** The notepad. What matters: the paper, its binding of dots, and the three lines from x 33 that grow from their left end on the screen. */
import { expect, test } from 'bun:test';

import { NOTEPAD_PROP } from './NotepadProp.ts';

test('the paper, the dotted binding and three written lines', () => {
  const drawing = NOTEPAD_PROP.shapesOf({ shown: 1, writtenLengths: [10, 5, 0] }, { facing: -1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['paper', 'binding', 'line-0', 'line-1', 'line-2']);
  expect(drawing.shapes[1]).toMatchObject({ dash: [1, 2.2], lineCap: 'round', stroke: 'graphite' });
  const halfWritten = drawing.shapes[3];
  expect(halfWritten?.kind === 'line' ? [halfWritten.x1, halfWritten.x2] : []).toEqual([43, 38]);
});
