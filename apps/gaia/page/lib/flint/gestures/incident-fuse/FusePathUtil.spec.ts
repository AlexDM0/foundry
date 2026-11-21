/**
 * The fuse path of Incident fuse. What matters: the whole fuse runs from the envelope's corner (44, -22) to its free end (51, -42) along
 * the two curves of `06-more-animations.md`; the part that has not burned shrinks from the free end at an even pace by length; the flame
 * is at its end, and at a full burn the part is the envelope's corner alone.
 */
import { expect, test } from 'bun:test';

import { FusePathUtil } from './FusePathUtil.ts';

function pointsOf(pathData: string): readonly (readonly [number, number])[] {
  return [...pathData.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])] as const);
}

function lengthOf(points: readonly (readonly [number, number])[]): number {
  return points.slice(1).reduce((sum, [pointX, pointY], i) => sum + Math.hypot(pointX - (points[i]?.[0] ?? pointX), pointY - (points[i]?.[1] ?? pointY)), 0);
}

test('the whole fuse runs from the envelope corner to the free end, through the end of the first curve', () => {
  const points = pointsOf(FusePathUtil.unburnedPathOf(0));
  expect(points[0]).toEqual([44, -22]);
  expect(points.at(-1)).toEqual([51, -42]);
  expect(points).toContainEqual([47, -32]);
  expect(FusePathUtil.flamePointOf(0)).toEqual({ x: 51, y: -42 });
});

test('the part that has not burned shrinks from the free end at an even pace by length', () => {
  const fullLength = lengthOf(pointsOf(FusePathUtil.unburnedPathOf(0)));
  for (const burn of [0.25, 0.5, 0.75]) {
    expect(lengthOf(pointsOf(FusePathUtil.unburnedPathOf(burn)))).toBeCloseTo(fullLength * (1 - burn), 1);
  }
});

test('the flame is at the end of the part that has not burned', () => {
  const half = pointsOf(FusePathUtil.unburnedPathOf(0.5)).at(-1);
  const flame = FusePathUtil.flamePointOf(0.5);
  expect(flame.x).toBeCloseTo(half?.[0] ?? Number.NaN, 2);
  expect(flame.y).toBeCloseTo(half?.[1] ?? Number.NaN, 2);
});

test('at a full burn the part is the envelope corner alone, and the flame is there', () => {
  expect(FusePathUtil.unburnedPathOf(1)).toBe('M44 -22');
  expect(FusePathUtil.flamePointOf(1)).toEqual({ x: 44, y: -22 });
});
