/**
 * The last ticket. What matters: the paper with its header, three full printed lines in the printed grey, and the written line, at 80%
 * around the paper's centre (38, -28) and then moved; the written line grows from its left end on the screen.
 */
import { expect, test } from 'bun:test';

import { WIND_DOWN_TICKET_PROP } from './WindDownTicketProp.ts';

const state = {
  shown: 1, writtenLength: 6, fade: 0.5, offsetX: 7, offsetY: -3,
};

test('the paper, the header, three printed lines and the written one, at 80% around the paper\'s centre, then moved', () => {
  const drawing = WIND_DOWN_TICKET_PROP.shapesOf(state, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.5);
  expect(drawing.transform).toEqual([{ translateX: 45, translateY: -31 }, { scaleX: 0.8, scaleY: 0.8 }, { translateX: -38, translateY: 28 }]);
  expect(drawing.shapes.map((shape) => [shape.key, shape.stroke])).toEqual([
    ['paper', 'paperEdge'],
    ['header', undefined],
    ['printed-line-0', 'paperText'],
    ['printed-line-1', 'paperText'],
    ['printed-line-2', 'paperText'],
    ['written-line', 'paperEdge'],
  ]);
  expect(drawing.shapes[5]).toMatchObject({ x1: 31, x2: 37, y1: -16 });
});

test('facing left, the written line grows from the far end of the paper, its left end on the screen', () => {
  expect(WIND_DOWN_TICKET_PROP.shapesOf(state, { facing: -1, holdingHand: null }).shapes[5]).toMatchObject({ x1: 43, x2: 37 });
});
