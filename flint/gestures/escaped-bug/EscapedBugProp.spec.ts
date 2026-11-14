/**
 * The shelf of Escaped bug. What matters: the shelf, the landed block that rocks on its bottom edge, the warning triangle on the block's
 * top right corner, the dashed crimson trace from the bug to the block, and the bug drawn last; a held hand sits above the bug.
 */
import { expect, test } from 'bun:test';

import { ESCAPED_BUG_PROP } from './EscapedBugProp.ts';

const DRAWN = {
  ...ESCAPED_BUG_PROP.hidden, shown: 1, sceneOpacity: 1, blockTurnDegrees: 2, bugOpacity: 1, traceOpacity: 1, bugBelowHand: 7.5,
};

test('the shelf, the block, the warning, the trace, then the bug', () => {
  const keys = ESCAPED_BUG_PROP.shapesOf(DRAWN, { facing: 1, holdingHand: null }).shapes.map((shape) => shape.key);
  expect(keys).toEqual(['shelf', 'block', 'warning', 'trace', 'bug-leg-0', 'bug-leg-1', 'bug-leg-2', 'bug-leg-3', 'bug']);
});

test('the block is landed at (30, -32), on the shelf from (26, -24) to (54, -24), and turns on the middle of its bottom edge', () => {
  const { shapes } = ESCAPED_BUG_PROP.shapesOf(DRAWN, { facing: 1, holdingHand: null });
  expect(shapes[0]).toMatchObject({
    x1: 26, y1: -24, x2: 54, y2: -24, stroke: 'graphite', strokeWidth: 1.6
  });
  expect(shapes[1]).toMatchObject({
    x: 30, y: -32, width: 12, height: 8, fill: 'done', transform: [{ rotateDegrees: 2, aboutX: 36, aboutY: -24 }]
  });
});

test('the warning is a crimson triangle of side 3 on the corner (42, -32); the trace is dashed, crimson, of width 1, from the bug to the block', () => {
  const { shapes } = ESCAPED_BUG_PROP.shapesOf(DRAWN, { facing: 1, holdingHand: null });
  const warning = shapes[2];
  if (warning?.kind !== 'polygon') throw new Error('the warning is a polygon');
  expect(warning.fill).toBe('alarm');
  expect(warning.points[1]?.x).toBe(43.5);
  expect(warning.points[2]?.x).toBe(40.5);
  expect(Math.hypot((warning.points[0]?.x ?? 0) - 43.5, (warning.points[0]?.y ?? 0) - (warning.points[1]?.y ?? 0))).toBeCloseTo(3);
  expect(shapes[3]).toMatchObject({
    x1: 34, y1: -42, x2: 36, y2: -32, stroke: 'alarm', strokeWidth: 1, dash: [2, 2]
  });
});

test('a held hand sits above the bug by the distance the state gives', () => {
  expect(ESCAPED_BUG_PROP.gripOf?.(DRAWN)).toEqual({ x: 34, y: -49.5 });
});
