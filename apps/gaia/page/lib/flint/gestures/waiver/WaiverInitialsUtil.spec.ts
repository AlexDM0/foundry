/**
 * The initials of Waiver. What matters: nothing is written at 0 but the start point; all of the path `m0 0 q2 -5 3.5 0 q1.5 4 3 -1 l2 2`
 * from (27, -53) at 1, ending at (35.5, -52); the written part grows by its length, so half of it ends halfway along; the initials are
 * mirrored back about their middle, x 34.25.
 */
import { expect, test } from 'bun:test';

import { WaiverInitialsUtil } from './WaiverInitialsUtil.ts';

function lengthOf(points: readonly { readonly x: number; readonly y: number }[]): number {
  return points.slice(1).reduce((length, point, i) => length + Math.hypot(point.x - (points[i]?.x ?? 0), point.y - (points[i]?.y ?? 0)), 0);
}

test('at 0 only the start point; at 1 the whole path, through the ends of its strokes', () => {
  expect(WaiverInitialsUtil.writtenPointsOf(0)).toEqual([{ x: 27, y: -53 }]);
  const all = WaiverInitialsUtil.writtenPointsOf(1);
  const end = all.at(-1);
  expect(end?.x).toBeCloseTo(35.5);
  expect(end?.y).toBeCloseTo(-52);
  expect(all.some((point) => Math.abs(point.x - 30.5) < 1e-9 && Math.abs(point.y + 53) < 1e-9)).toBe(true);
  expect(Math.min(...all.map((point) => point.y))).toBeLessThan(-55);
});

test('the written part grows by its length', () => {
  const half = lengthOf(WaiverInitialsUtil.writtenPointsOf(0.5));
  expect(half).toBeCloseTo(lengthOf(WaiverInitialsUtil.writtenPointsOf(1)) / 2);
});

test('the initials are mirrored back about their middle', () => {
  expect(WaiverInitialsUtil.mirrorAxisX()).toBeCloseTo(31.25);
});
