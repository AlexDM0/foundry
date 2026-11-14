/**
 * The blocks of Conflict. What matters: the blocks, then the teeth over them, placed by their centres on the edges that face and shaken
 * with the blocks; the crimson lines at the seam; the shavings; and Merge's merged block, tick and sparks; and the hidden state draws.
 */
import { expect, test } from 'bun:test';

import { CONFLICT_BLOCKS_PROP } from './ConflictBlocksProp.ts';

test('the blocks, their teeth, the lines of the hit, the shavings, the merged block, the tick and the sparks', () => {
  const drawing = CONFLICT_BLOCKS_PROP.shapesOf({
    ...CONFLICT_BLOCKS_PROP.hidden,
    shown:         1,
    topBlockY:     -36,
    bottomBlockY:  -24,
    blocksShakeX:  0.5,
    topTeethX:     [33, 39],
    blocksOpacity: 1,
    seamY:         -26,
    impactOpacity: 1,
    shavings:      [{ x: 30, y: -28, opacity: 0.5 }],
    sparks:        [{
      x: 34, y: -26, turnDegrees: 90, opacity: 0.5,
    }],
  }, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual([
    'top-block',
    'bottom-block',
    'top-tooth-0',
    'top-tooth-1',
    'bottom-tooth-0',
    'bottom-tooth-1',
    'impact-0',
    'impact-1',
    'shaving-0',
    'merged-block',
    'tick',
    'spark-0',
  ]);
  expect(drawing.shapes[0]).toMatchObject({ x: 28.5, y: -36, fill: 'emberLight' });
  expect(drawing.shapes[2]).toMatchObject({
    x: 32, y: -28, width: 3, height: 2, fill: 'emberLight',
  });
  expect(drawing.shapes[4]).toMatchObject({
    x: 29, y: -26, width: 3, height: 2, fill: 'graphite',
  });
  expect(drawing.shapes[6]).toMatchObject({
    x1: 26, y1: -26, x2: 22, stroke: 'alarm', strokeWidth: 1,
  });
  expect(drawing.shapes[7]).toMatchObject({ x1: 42, x2: 46 });
  expect(drawing.shapes[8]).toMatchObject({
    x: 29.4, width: 1.2, fill: 'emberLight', opacity: 0.5,
  });
  expect(drawing.shapes[10]).toMatchObject({ pathData: 'M45 -27 l3 3 l6 -7' });
  expect(drawing.shapes[11]).toMatchObject({ width: 3 });
});

test('the hidden state draws, with nothing seen', () => {
  const drawing = CONFLICT_BLOCKS_PROP.shapesOf(CONFLICT_BLOCKS_PROP.hidden, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0);
  expect(drawing.shapes.length).toBeGreaterThan(0);
});
