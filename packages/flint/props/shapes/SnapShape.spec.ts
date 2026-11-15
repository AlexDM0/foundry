/**
 * The snap of two pressed blocks. What matters: the merged block is landed green, two blocks high at (28, -34), and moves by its offset; the tick starts
 * at (45, -27); each spark is a small spark of the snap's own side 3, in order after the block and the tick.
 */
import { expect, test } from 'bun:test';

import { snapShapesOf } from './SnapShape.ts';

test('the merged block, its tick, then the sparks', () => {
  const shapes = snapShapesOf({
    mergedOpacity: 1,
    mergedOffsetX: 6,
    mergedOffsetY: 2,
    tickOpacity:   0.5,
    sparks:        [{
      x: 20, y: -28, turnDegrees: 90, opacity: 0.5
    }],
  });
  expect(shapes.map((shape) => shape.key)).toEqual(['merged-block', 'tick', 'spark-0']);
  expect(shapes[0]).toMatchObject({
    x: 28, y: -34, height: 16, fill: 'done', transform: [{ translateX: 6, translateY: 2 }],
  });
  expect(shapes[1]).toMatchObject({ pathData: 'M45 -27 l3 3 l6 -7', opacity: 0.5 });
  expect(shapes[2]).toMatchObject({ width: 3, transform: [{ translateX: 20, translateY: -28 }, { rotateDegrees: 90 }] });
});
