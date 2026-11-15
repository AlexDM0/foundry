/**
 * The sheet of Ink the draft. What matters: a draft has a dashed outline and dashed lines, a ready ticket a solid outline and solid lines;
 * the traced outline is a path through the points the pen passed; the sparks show only in flight; the cycle fades and moves the sheet, and
 * the pop scales it around the paper's centre.
 */
import { expect, test } from 'bun:test';

import type { InkDraftSheetState } from './InkDraftSheetProp.ts';
import { INK_DRAFT_SHEET_PROP }    from './InkDraftSheetProp.ts';

const DRAFT: InkDraftSheetState = {
  shown:         1,
  cycleOpacity:  0.5,
  tracedPoints:  [{ x: 28, y: -46 }, { x: 38, y: -44 }],
  isInked:       false,
  headerOpacity: 0,
  scale:         1,
  sparkFlight:   0,
  offsetX:       0,
  offsetY:       0,
};

test('a draft: dashed paper and lines, the traced outline through the passed points, no header and no sparks', () => {
  const drawing = INK_DRAFT_SHEET_PROP.shapesOf(DRAFT, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['paper', 'header', 'line-0', 'line-1', 'line-2', 'traced-outline', 'spark-0', 'spark-1']);
  const byKey = Object.fromEntries(drawing.shapes.map((shape) => [shape.key, shape]));
  expect(byKey['paper']?.dash).toEqual([2, 2]);
  expect(byKey['line-1']?.dash).toEqual([2, 2]);
  expect(byKey['traced-outline']).toMatchObject({ pathData: 'M28 -46 L38 -44', opacity: 1, strokeWidth: 1.4 });
  expect([byKey['header']?.opacity, byKey['spark-0']?.opacity]).toEqual([0, 0]);
  expect(drawing.opacity).toBe(0.5);
});

test('inked: solid paper and lines, the header, and the sparks while they fly', () => {
  const drawing = INK_DRAFT_SHEET_PROP.shapesOf({
    ...DRAFT, isInked: true, headerOpacity: 1, sparkFlight: 0.5
  }, { facing: 1, holdingHand: null });
  const byKey = Object.fromEntries(drawing.shapes.map((shape) => [shape.key, shape]));
  expect([byKey['paper']?.dash, byKey['line-0']?.dash]).toEqual([undefined, undefined]);
  expect([byKey['header']?.opacity, byKey['spark-0']?.opacity, byKey['spark-1']?.opacity]).toEqual([1, 0.5, 0.5]);
});

test('the pop scales and the leave moves the sheet around the paper\'s centre', () => {
  const drawing = INK_DRAFT_SHEET_PROP.shapesOf({
    ...DRAFT, scale: 1.05, offsetX: 7, offsetY: -3
  }, { facing: 1, holdingHand: null });
  expect(drawing.transform).toEqual([
    { translateX: 45, translateY: -31 },
    { scaleX: 1.05, scaleY: 1.05 },
    { translateX: -38, translateY: 28 },
  ]);
});

test('the hidden state draws nothing traced', () => {
  const drawing = INK_DRAFT_SHEET_PROP.shapesOf(INK_DRAFT_SHEET_PROP.hidden, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0);
  expect(drawing.shapes.find((shape) => shape.key === 'traced-outline')?.opacity).toBe(0);
});
