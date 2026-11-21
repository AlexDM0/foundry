/** The blocks of Merge. What matters: the two blocks, the merged block with its offset, the tick at (45, -27), and one spark of 3 for each. */
import { expect, test } from 'bun:test';

import { MERGE_BLOCKS_PROP } from './MergeBlocksProp.ts';

test('the blocks, the merged block, the tick and the sparks, in that order', () => {
  const drawing = MERGE_BLOCKS_PROP.shapesOf({
    ...MERGE_BLOCKS_PROP.hidden,
    shown:         1,
    blocksOpacity: 0,
    mergedOpacity: 1,
    mergedOffsetX: 6,
    mergedOffsetY: 2.5,
    tickOpacity:   1,
    sparks:        [{
      x: 34, y: -26, turnDegrees: 90, opacity: 0.5,
    }],
  }, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['top-block', 'bottom-block', 'merged-block', 'tick', 'spark-0']);
  expect(drawing.shapes[2]).toMatchObject({
    y: -34, height: 16, fill: 'done', transform: [{ translateX: 6, translateY: 2.5 }]
  });
  expect(drawing.shapes[3]).toMatchObject({ pathData: 'M45 -27 l3 3 l6 -7', opacity: 1 });
  expect(drawing.shapes[4]).toMatchObject({ width: 3, opacity: 0.5 });
});
