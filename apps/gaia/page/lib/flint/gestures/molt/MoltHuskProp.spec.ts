/**
 * The husk. What matters: the body path in the husk colour, with two grey eyes of height 5 at the eye places of rest; the whole turns around
 * the bottom tip and then moves; its opacity is the gesture's times its shown level.
 */
import { expect, test } from 'bun:test';

import { MOLT_HUSK_PROP } from './MoltHuskProp.ts';

test('the body path in the husk colour and two grey eyes, turned around the bottom tip, then moved', () => {
  const drawing = MOLT_HUSK_PROP.shapesOf({
    shown: 1, offsetX: -7, offsetY: 4, turnDegrees: -12.5, opacity: 0.45,
  }, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.45);
  expect(drawing.transform).toEqual([{ translateX: -7, translateY: 4 }, { rotateDegrees: -12.5 }]);
  expect(drawing.shapes[0]).toEqual({
    kind: 'path', key: 'husk', pathData: 'M0 -50 L20 -24 L0 0 L-20 -24Z', fill: 'husk',
  });
  expect(drawing.shapes.slice(1)).toEqual([
    {
      kind: 'rectangle', key: 'left-eye', x: -5, y: -26.5, width: 4, height: 5, fill: 'paperFold',
    },
    {
      kind: 'rectangle', key: 'right-eye', x: 5, y: -26.5, width: 4, height: 5, fill: 'paperFold',
    },
  ]);
});
