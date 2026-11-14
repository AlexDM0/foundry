/** The block of Quiet job. What matters: a graphite block of 14 by 10 at (30, -30) with the corner of the shared block, moved down by a tap. */
import { expect, test } from 'bun:test';

import { LISTEN_BLOCK_PROP } from './ListenBlockProp.ts';

test('a graphite block of 14 by 10 at (30, -30), moved down by a tap, under the entrance fade', () => {
  const drawing = LISTEN_BLOCK_PROP.shapesOf({ shown: 1, opacity: 0.5, drop: 0.8 }, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.5);
  expect(drawing.shapes).toEqual([{
    kind: 'rectangle', key: 'block', x: 30, y: -29.2, width: 14, height: 10, cornerRadius: 1, fill: 'graphite',
  }]);
});
