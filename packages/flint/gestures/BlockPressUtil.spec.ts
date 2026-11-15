/**
 * The press of two blocks, against `02-animations.md`, "Merge". What matters, since every gesture that presses blocks draws it through
 * this util: the hexagons sit 7 above the top block and 15 below the bottom one and let go by 3 at the snap; the eyes widen from 6 to 10
 * over the second half of a press only; the snap squashes the leaned body; the merged block and its tick show only after the snap and
 * leave together by (12, 5).
 */
import { expect, test } from 'bun:test';

import { BlockPressUtil } from './BlockPressUtil.ts';

test('the hexagons press the blocks and let go by 3 at the snap', () => {
  const pressing = BlockPressUtil.pressingHandsOf(-40, -20, false);
  expect(pressing.near).toEqual({
    cornerCount: 6, centreX: 34, centreY: -47, radius: 6, turnDegrees: 0, placement: 'eased',
  });
  expect(pressing.far).toMatchObject({ centreY: -5, radius: 5.5 });
  const snapped = BlockPressUtil.pressingHandsOf(-40, -20, true);
  expect([snapped.near.centreY, snapped.far.centreY]).toEqual([-50, -2]);
});

test('the eyes widen over the second half of the press only', () => {
  expect([0, 0.5, 0.75, 1].map(BlockPressUtil.pressingEyeHeightOf)).toEqual([6, 6, 8, 10]);
});

test('the snap squashes the leaned body', () => {
  expect(BlockPressUtil.pressingBodyOf(false)).toEqual({ leanDegrees: 5 });
  expect(BlockPressUtil.pressingBodyOf(true)).toEqual({ leanDegrees: 5, widthFactor: 1.04, heightFactor: 0.95 });
});

test('the merged block and its tick show only after the snap, and leave together', () => {
  expect(BlockPressUtil.snappedBlockOf(false, 0)).toEqual({
    mergedOpacity: 0, mergedOffsetX: 0, mergedOffsetY: 0, tickOpacity: 0,
  });
  expect(BlockPressUtil.snappedBlockOf(true, 0.5)).toEqual({
    mergedOpacity: 0.5, mergedOffsetX: 6, mergedOffsetY: 2.5, tickOpacity: 0.5,
  });
});
