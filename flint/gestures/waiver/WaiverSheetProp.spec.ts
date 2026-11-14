/**
 * The sheet of Waiver. What matters: the paper, its four printed lines, a crimson and a grey cross that cross-fade as the cross greys, the
 * grey tick that takes its place, and the initials on top, mirrored back about their own middle and seen once anything is written.
 */
import { expect, test } from 'bun:test';

import type { WaiverSheetState } from './WaiverSheetProp.ts';
import { WAIVER_SHEET_PROP }     from './WaiverSheetProp.ts';

const GREYING: WaiverSheetState = {
  shown: 1, cycleOpacity: 1, writtenShare: 1, greyed: 0.25, waived: 0.5,
};

test('the paper, the lines, the two crosses and the grey tick, then the initials', () => {
  const drawing = WAIVER_SHEET_PROP.shapesOf(GREYING, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['paper', 'line-0', 'line-1', 'line-2', 'line-3', 'cross', 'grey-cross', 'grey-tick', 'initials']);
  const byKey = Object.fromEntries(drawing.shapes.map((shape) => [shape.key, shape]));
  expect([byKey['cross']?.stroke, byKey['grey-cross']?.stroke, byKey['grey-tick']?.stroke]).toEqual(['alarm', 'paperEdge', 'paperEdge']);
  expect([byKey['cross']?.opacity, byKey['grey-cross']?.opacity, byKey['grey-tick']?.opacity]).toEqual([0.375, 0.125, 0.5]);
  expect(byKey['initials']).toMatchObject({ stroke: 'graphite', strokeWidth: 1.3, opacity: 1 });
  expect(byKey['initials']?.unmirroredAboutX).toBeCloseTo(31.25);
});

test('the initials are not seen before the pen writes', () => {
  const drawing = WAIVER_SHEET_PROP.shapesOf(WAIVER_SHEET_PROP.hidden, { facing: 1, holdingHand: null });
  expect(drawing.shapes.find((shape) => shape.key === 'initials')?.opacity).toBe(0);
  expect(drawing.opacity).toBe(0);
});
