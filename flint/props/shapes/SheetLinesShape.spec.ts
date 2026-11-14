/** The printed lines of Review's sheet. What matters: four lines from x 31 to 45, 7 apart from y -39, each 2.8 lower at its end; the read one orange. */
import { expect, test } from 'bun:test';

import { sheetLineShapesOf } from './SheetLinesShape.ts';

test('four grey lines parallel to the top edge, the read one in the body colour', () => {
  const lines = sheetLineShapesOf(1);
  expect(lines.map((line) => (line.kind === 'path' ? line.pathData : ''))).toEqual(['M31 -39 L45 -36.2', 'M31 -32 L45 -29.2', 'M31 -25 L45 -22.2', 'M31 -18 L45 -15.2']);
  expect(lines.map((line) => line.stroke)).toEqual(['paperText', 'body', 'paperText', 'paperText']);
  expect(sheetLineShapesOf(null).every((line) => line.stroke === 'paperText')).toBe(true);
});
