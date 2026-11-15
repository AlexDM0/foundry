/**
 * The props of Chain. What matters: sheet A with a header in the body colour and sheet B with a grey one, both mini sheets; the links lie
 * evenly from (36, -34) to (43, -24), turn 35 and 125 degrees in turn, and follow sheet B when it pulls; a link not added yet is not seen.
 */
import { expect, test } from 'bun:test';

import type { ChainedSheetsState }                from './ChainedSheetsProp.ts';
import { CHAINED_SHEETS_PROP, chainLinkCentreOf } from './ChainedSheetsProp.ts';

const MADE: ChainedSheetsState = {
  shown: 1, cycleOpacity: 1, linkScales: [1, 1, 0], sheetBOffsetX: 0, sheetBOffsetY: 0,
};

test('two mini sheets with their headers, then three links', () => {
  const drawing = CHAINED_SHEETS_PROP.shapesOf(MADE, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['sheet-a-paper', 'sheet-a-header', 'sheet-b-paper', 'sheet-b-header', 'link-0', 'link-1', 'link-2']);
  const byKey = Object.fromEntries(drawing.shapes.map((shape) => [shape.key, shape]));
  expect([byKey['sheet-a-header']?.fill, byKey['sheet-b-header']?.fill]).toEqual(['body', 'paperEdge']);
  expect(byKey['sheet-b-paper']?.transform?.[0]).toEqual({ translateX: 46, translateY: -18 });
  expect([byKey['link-0']?.opacity, byKey['link-2']?.opacity]).toEqual([1, 0]);
  expect(byKey['link-1']?.transform).toEqual([{ translateX: 39.5, translateY: -29 }, { rotateDegrees: 125 }, { scaleX: 1, scaleY: 1 }]);
});

test('the links follow sheet B in a straight line from sheet A\'s end of the chain', () => {
  expect([0, 1, 2].map((linkIndex) => chainLinkCentreOf(linkIndex, { x: 4, y: 3 }))).toEqual([
    { x: 36, y: -34 },
    { x: 41.5, y: -27.5 },
    { x: 47, y: -21 },
  ]);
  const pulled = CHAINED_SHEETS_PROP.shapesOf({ ...MADE, sheetBOffsetX: 4, sheetBOffsetY: 3 }, { facing: 1, holdingHand: null });
  expect(pulled.shapes.find((shape) => shape.key === 'sheet-b-paper')?.transform?.[0]).toEqual({ translateX: 50, translateY: -15 });
});
