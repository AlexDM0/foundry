/**
 * The block of the shared vocabulary. What matters: 12 by 8 with a corner of 1, its colour by its state, a merged block two high, and a
 * smaller block (of a queue or a crate) with the same corner.
 */
import { expect, test } from 'bun:test';

import { blockShapeOf } from './BlockShape.ts';

test.each([
  ['work-in-progress', 'emberLight'],
  ['other-side', 'graphite'],
  ['landed', 'done'],
] as const)('a %s block is %s', (state, fill) => {
  expect(blockShapeOf({
    key: 'block', state, x: 28, y: -42,
  })).toEqual({
    kind: 'rectangle', key: 'block', x: 28, y: -42, width: 12, height: 8, cornerRadius: 1, fill,
  });
});

test('a block can be higher, fade and move', () => {
  expect(blockShapeOf({
    key: 'merged', state: 'landed', x: 28, y: -34, heightUnits: 16, opacity: 0.5, offsetX: 12, offsetY: 5,
  })).toMatchObject({ height: 16, opacity: 0.5, transform: [{ translateX: 12, translateY: 5 }] });
});

test('a block can be smaller, with the same corner', () => {
  expect(blockShapeOf({
    key: 'queued', state: 'work-in-progress', x: 24, y: -32, widthUnits: 7, heightUnits: 5,
  })).toMatchObject({ width: 7, height: 5, cornerRadius: 1 });
});
