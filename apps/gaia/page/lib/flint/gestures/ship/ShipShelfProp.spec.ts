/**
 * The shelf of Ship. What matters: the shelf from (28, -30) to (56, -30), lower by its drop; the landed block, squashed on its bottom edge;
 * and the tick from (40, -50), which the renderer never mirrors.
 */
import { expect, test } from 'bun:test';

import { SHIP_SHELF_PROP } from './ShipShelfProp.ts';

test('the shelf, the block and the tick', () => {
  const { shapes } = SHIP_SHELF_PROP.shapesOf({
    shown: 1, sceneOpacity: 1, blockX: 36, blockY: -38, blockHeightFactor: 0.85, shelfDrop: 1, tickOpacity: 1,
  }, { facing: 1, holdingHand: null });
  expect(shapes.map((shape) => shape.key)).toEqual(['shelf', 'block', 'tick']);
  expect(shapes[0]).toMatchObject({
    x1: 28, y1: -29, x2: 56, y2: -29, stroke: 'graphite', strokeWidth: 1.6
  });
  expect(shapes[1]).toMatchObject({ x: 36, width: 12, fill: 'done' });
  expect(shapes[1]).toMatchObject({ height: 6.8 });
  if (shapes[1]?.kind !== 'rectangle') throw new Error('the block is a rectangle');
  expect(shapes[1].y + shapes[1].height).toBeCloseTo(-30);
  expect(shapes[2]).toMatchObject({ pathData: 'M40 -50 l3 3 l6 -7', stroke: 'done', unmirroredAboutX: 44.5 });
});
