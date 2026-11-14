/**
 * The crate of Customs. What matters: the item is drawn first, so the crate's front hides it while it is in the crate; the item is a 6 by
 * 4 work-in-progress block around its centre; the crate and its two open flaps are graphite.
 */
import { expect, test } from 'bun:test';

import { CUSTOMS_CRATE_PROP } from './CustomsCrateProp.ts';

test('the item around its centre, then the crate and its flaps', () => {
  const drawing = CUSTOMS_CRATE_PROP.shapesOf({
    shown: 1, cycleOpacity: 0.5, itemCentreX: 39, itemCentreY: -30, itemOpacity: 1,
  }, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.5);
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['item', 'crate', 'flap-0', 'flap-1']);
  expect(drawing.shapes[0]).toMatchObject({
    x: 36, y: -32, width: 6, height: 4, fill: 'emberLight', opacity: 1,
  });
  expect(drawing.shapes[1]).toMatchObject({ fill: 'hardware', stroke: 'graphite', strokeWidth: 1.4 });
  expect(drawing.shapes[2]).toMatchObject({
    x1: 28, y1: -24, x2: 24, y2: -30,
  });
  expect(drawing.shapes[3]).toMatchObject({
    x1: 50, y1: -24, x2: 54, y2: -30,
  });
});
