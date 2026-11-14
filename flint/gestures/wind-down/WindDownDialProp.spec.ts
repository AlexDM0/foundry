/** The dial. What matters: a graphite ring of 9.5 around (40, -40), and a square pointer of 3 on the ring at its angle, 0 forward and negative up. */
import { expect, test } from 'bun:test';

import { WIND_DOWN_DIAL_PROP } from './WindDownDialProp.ts';

test('the ring, and the pointer on it at its angle', () => {
  const drawing = WIND_DOWN_DIAL_PROP.shapesOf({ shown: 1, pointerDegrees: -90, fade: 0.5 }, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.5);
  expect(drawing.shapes[0]).toEqual({
    kind: 'circle', key: 'ring', centreX: 40, centreY: -40, radius: 9.5, fill: 'none', stroke: 'graphite', strokeWidth: 1.4,
  });
  const pointer = drawing.shapes[1];
  expect(pointer).toMatchObject({ width: 3, height: 3, fill: 'body' });
  expect(pointer?.kind === 'rectangle' ? [pointer.x, pointer.y] : []).toEqual([expect.closeTo(38.5, 9), expect.closeTo(-51, 9)]);
});
