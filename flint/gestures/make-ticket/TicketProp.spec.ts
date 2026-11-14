/** The ticket. What matters: the paper, its header, the three written lines, the seal once stamped; its cycle fades it and filing moves it. */
import { expect, test } from 'bun:test';

import { TICKET_PROP } from './TicketProp.ts';

test('the paper, the header, three lines and the seal, faded by its cycle and moved as it is filed', () => {
  const drawing = TICKET_PROP.shapesOf({
    shown: 1, cycleOpacity: 0.5, writtenLengths: [12, 6, 0], sealShown: true, offsetX: 7, offsetY: -3,
  }, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['paper', 'header', 'line-0', 'line-1', 'line-2', 'seal']);
  expect([drawing.opacity, drawing.transform]).toEqual([0.5, [{ translateX: 7, translateY: -3 }]]);
  expect(drawing.shapes.map((shape) => shape.opacity)).toEqual([undefined, undefined, 1, 1, 0, 1]);
});
