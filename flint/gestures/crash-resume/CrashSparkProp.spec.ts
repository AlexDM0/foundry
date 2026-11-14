/** The crash spark. What matters: the spark of a Watcher at the body centre (0, -24), scaled around that centre, and faded by the gesture. */
import { expect, test } from 'bun:test';

import { CRASH_SPARK_PROP } from './CrashSparkProp.ts';

test('the spark and its core at the body centre, scaled around it and faded', () => {
  const drawing = CRASH_SPARK_PROP.shapesOf({ shown: 1, scale: 1.3, fade: 0.5 }, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.5);
  expect(drawing.transform).toEqual([{ translateX: 0, translateY: -24 }, { scaleX: 1.3, scaleY: 1.3 }, { translateX: -0, translateY: 24 }]);
  expect(drawing.shapes.map((shape) => [shape.key, shape.fill])).toEqual([['spark', 'body'], ['spark-core', 'emberLight']]);
  expect(drawing.shapes[0]).toMatchObject({ x: -2, y: -26, width: 4 });
});
