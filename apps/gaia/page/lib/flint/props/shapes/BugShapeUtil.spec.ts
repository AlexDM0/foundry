/** The bug of the shared vocabulary. What matters: a crimson hexagon of 2.2 with four legs of 1.6, turned as one by its wiggle of 12 × sin(t / 50). */
import { expect, test } from 'bun:test';

import { BugShapeUtil } from './BugShapeUtil.ts';

test('four legs and a hexagon, all turned around the centre by the wiggle', () => {
  const shapes = BugShapeUtil.bugOf({
    key: 'bug', centreX: 43, centreY: -28, turnDegrees: 6,
  });
  expect(shapes.map((shape) => shape.kind)).toEqual(['line', 'line', 'line', 'line', 'polygon']);
  const body = shapes[4];
  expect(body?.kind === 'polygon' ? body.points.length : 0).toBe(6);
  expect(shapes.every((shape) => shape.transform?.[0] !== undefined && 'aboutX' in shape.transform[0] && shape.transform[0].rotateDegrees === 6)).toBe(true);
  const leg = shapes[0];
  const legLength = leg?.kind === 'line' ? Math.hypot(leg.x2 - leg.x1, leg.y2 - leg.y1) : 0;
  expect(legLength).toBeCloseTo(1.6, 9);
});

test('the wiggle is 12 × sin(t / 50)', () => {
  expect(BugShapeUtil.wiggleDegreesAt(75)).toBeCloseTo(12 * Math.sin(1.5), 9);
});
