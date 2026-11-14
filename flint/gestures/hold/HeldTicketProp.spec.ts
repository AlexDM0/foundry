/**
 * The held ticket. What matters: the paper and its header at 80% around the paper's centre (38, -28), the graphite clamp path over the top
 * edge, which only the clamp's offset moves, and the entrance fade on the whole drawing.
 */
import { expect, test } from 'bun:test';

import { HELD_TICKET_PROP } from './HeldTicketProp.ts';

test('the ticket at 80% around (38, -28), its header, and the clamp moved by its offset, under the entrance fade', () => {
  const drawing = HELD_TICKET_PROP.shapesOf({ shown: 1, opacity: 0.5, clampOffsetY: -3 }, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.5);
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['paper', 'header', 'clamp']);
  const scaled = [{ translateX: 38, translateY: -28 }, { scaleX: 0.8, scaleY: 0.8 }, { translateX: -38, translateY: 28 }];
  expect(drawing.shapes[0]?.transform).toEqual(scaled);
  expect(drawing.shapes[1]?.transform).toEqual(scaled);
  expect(drawing.shapes[2]).toMatchObject({ pathData: 'M33 -49 H43 V-39 H40 V-46 H36 V-39 H33Z', fill: 'graphite', transform: [{ translateX: 0, translateY: -3 }], });
});
