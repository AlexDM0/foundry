/**
 * The floating sheet of Review. What matters: the farthest stacked page is drawn first and a page shows while the count is above it; the
 * line Flint reads is in the body colour; the verdict shows as a tick or a cross; the sheet slides in by 6 and moves by its offset.
 */
import { expect, test } from 'bun:test';

import { SHEET_PROP } from './SheetProp.ts';

const drawingOf = (changes: Partial<Parameters<typeof SHEET_PROP.shapesOf>[0]>) => SHEET_PROP.shapesOf(
  { ...SHEET_PROP.hidden, shown: 1, ...changes },
  { facing: 1, holdingHand: null },
);

test('the stacked pages, farthest first, show while the count is above them', () => {
  const pages = drawingOf({ stackedPageCount: 1 }).shapes.filter((shape) => shape.key.startsWith('stacked-page'));
  expect(pages.map((page) => [page.key, page.opacity])).toEqual([['stacked-page-2', 0], ['stacked-page-1', 0], ['stacked-page-0', 1]]);
});

test('the line Flint reads is in the body colour, and the verdict shows', () => {
  const { shapes } = drawingOf({ readLineIndex: 1, verdict: 'cross' });
  expect(shapes.filter((shape) => shape.key.startsWith('line')).map((line) => line.stroke)).toEqual(['paperText', 'body', 'paperText', 'paperText']);
  expect(shapes.filter((shape) => shape.key === 'tick' || shape.key === 'cross').map((shape) => [shape.key, shape.opacity])).toEqual([['tick', 0], ['cross', 1]]);
});

test('it slides in by 6 from the side away from Flint and moves down by its offset', () => {
  expect(drawingOf({ shown: 0.5, offsetY: 1.5 }).transform).toEqual([{ translateX: 3, translateY: 1.5 }]);
});
