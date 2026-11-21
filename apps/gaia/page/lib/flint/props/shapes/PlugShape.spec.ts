/** The plug. What matters: a graphite block of 6 by 4 from its top left corner, two prongs of 2 by 0.8 out of its far edge, drawn first. */
import { expect, test } from 'bun:test';

import { plugShapesOf } from './PlugShape.ts';

test('the prongs, then the block', () => {
  const [firstProng, secondProng, block] = plugShapesOf({ x: 40, y: -14, opacity: 0.5 });
  expect(firstProng).toMatchObject({
    key: 'prong-0', x: 46, y: -13.2, width: 2, height: 0.8, fill: 'graphite', opacity: 0.5,
  });
  expect(secondProng).toMatchObject({ key: 'prong-1', y: -11.6 });
  expect(block).toMatchObject({
    key: 'plug', x: 40, y: -14, width: 6, height: 4, fill: 'graphite', opacity: 0.5,
  });
});
