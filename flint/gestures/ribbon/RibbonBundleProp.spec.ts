/**
 * The bundle of Ribbon. What matters: three mini sheets with their headers that gather from apart (x 30, 38, 46, turned -14, 0, 14) into a
 * fan (x 34, 38, 42, turned -8, 0, 8); the ribbon grows from x 28; the bow is two wings and a knot at (38, -30.5), seen once it scales in.
 */
import { expect, test } from 'bun:test';

import type { RibbonBundleState } from './RibbonBundleProp.ts';
import { RIBBON_BUNDLE_PROP }     from './RibbonBundleProp.ts';

const TIED: RibbonBundleState = {
  shown: 1, cycleOpacity: 1, gathered: 1, wrapped: 1, bowScale: 1, offsetX: 7, offsetY: -3,
};

test('the sheets, the ribbon and the bow, in that order, moved as one bundle', () => {
  const drawing = RIBBON_BUNDLE_PROP.shapesOf(TIED, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual([
    'sheet-0', 'sheet-0-header', 'sheet-1', 'sheet-1-header', 'sheet-2', 'sheet-2-header', 'ribbon', 'bow-near-wing', 'bow-far-wing', 'bow-knot',
  ]);
  expect(drawing.transform).toEqual([{ translateX: 7, translateY: -3 }]);
  const byKey = Object.fromEntries(drawing.shapes.map((shape) => [shape.key, shape]));
  expect(byKey['ribbon']).toMatchObject({
    x: 28, width: 20, fill: 'ribbon', opacity: 1
  });
  expect(byKey['bow-knot']?.transform).toEqual([{ translateX: 38, translateY: -30.5 }, { scaleX: 1, scaleY: 1 }]);
});

test('the sheets gather from apart into a fan', () => {
  const firstSheetTurnOf = (gathered: number): unknown => RIBBON_BUNDLE_PROP.shapesOf({ ...TIED, gathered }, { facing: 1, holdingHand: null }).shapes[0]?.transform?.[0];
  expect(firstSheetTurnOf(0)).toEqual({ rotateDegrees: -14, aboutX: 30, aboutY: -30 });
  expect(firstSheetTurnOf(1)).toEqual({ rotateDegrees: -8, aboutX: 34, aboutY: -30 });
});

test('before the wrap and the bow, neither is seen', () => {
  const drawing = RIBBON_BUNDLE_PROP.shapesOf({ ...TIED, wrapped: 0, bowScale: 0 }, { facing: 1, holdingHand: null });
  expect(drawing.shapes.filter((shape) => shape.key === 'ribbon' || shape.key.startsWith('bow')).map((shape) => shape.opacity)).toEqual([0, 0, 0, 0]);
});
