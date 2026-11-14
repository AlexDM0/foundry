/**
 * The dying spark. What matters: at (44, -46), the live spark cross-fades to the grey dead one as it dies, and it shrinks around its
 * centre and moves down.
 */
import { expect, test } from 'bun:test';

import { DYING_SPARK_PROP } from './DyingSparkProp.ts';

test('half dead: live and grey at half each, at half its scale around its centre, moved down', () => {
  const drawing = DYING_SPARK_PROP.shapesOf({
    shown: 1, offsetY: 3, death: 0.5, fade: 1,
  }, { facing: 1, holdingHand: null });
  expect(drawing.transform).toEqual([{ translateX: 44, translateY: -43 }, { scaleX: 0.5, scaleY: 0.5 }, { translateX: -44, translateY: 46 }]);
  expect(drawing.shapes.map((shape) => [shape.key, shape.fill, shape.opacity])).toEqual([
    ['live', 'body', 0.5],
    ['live-core', 'emberLight', 0.5],
    ['dead', 'paperEdge', 0.5],
  ]);
});
