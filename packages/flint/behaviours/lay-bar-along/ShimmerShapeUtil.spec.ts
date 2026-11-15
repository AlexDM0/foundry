/**
 * The shimmer of Lay the bar along. What matters: it lies from the bar's left end to 18 behind Flint, at the bar's height; the 6 nearest
 * Flint are the head in the body colour at 70% of its freshness, the rest four segments in the light ember colour at 50% of theirs; a
 * part's freshness falls from 1 as Flint passes it to 0 800 ms later, so the faded tail is not drawn; the shimmer's ends are rounded with
 * radius 3, the joins between its pieces are flat; and there is none before Flint is 18 past the left end.
 */
import { describe, expect, test } from 'bun:test';

import type { ShimmerMoment } from './ShimmerShapeUtil.ts';
import { ShimmerShapeUtil }   from './ShimmerShapeUtil.ts';

/** A lay from x 100 at 100 units a second, started at 0 ms: Flint is at 100 + t / 10, and the head ends 18 behind it. */
function momentAt(nowMilliseconds: number): ShimmerMoment {
  return {
    leftX: 100, flintX: 100 + (nowMilliseconds / 10), topY: 40, bottomY: 50, layStartedMilliseconds: 0, speedUnitsPerSecond: 100, nowMilliseconds,
  };
}

describe('where the shimmer lies', () => {
  test('there is none before Flint is 18 past the left end', () => {
    expect(ShimmerShapeUtil.shimmerShapesAt(momentAt(180))).toEqual([]);
  });

  test('from the left end to 18 behind Flint: four segments, then the 6 nearest Flint as the head in the body colour', () => {
    const shapes = ShimmerShapeUtil.shimmerShapesAt(momentAt(500));
    expect(shapes.map((shape) => [shape.key, shape.fill])).toEqual([
      ['segment-0', 'emberLight'], ['segment-1', 'emberLight'], ['segment-2', 'emberLight'], ['segment-3', 'emberLight'], ['head', 'body'],
    ]);
    const paths = shapes.map((shape) => (shape.kind === 'path' ? shape.pathData : ''));
    expect(paths[0]).toStartWith('M103 40');
    expect(paths[4]).toContain('H129');
    expect(paths[4]).toContain('A3 3 0 0 1 132 43');
  });

  test('a short shimmer is the head alone, rounded at both ends', () => {
    const shapes = ShimmerShapeUtil.shimmerShapesAt(momentAt(200));
    expect(shapes.map((shape) => shape.key)).toEqual(['head']);
    const path = shapes[0]?.kind === 'path' ? shapes[0].pathData : '';
    expect(path.match(/A/g)).toHaveLength(4);
  });
});

describe('the age of each part', () => {
  test('a part\'s age is the time since Flint passed it', () => {
    expect(ShimmerShapeUtil.ageAt(momentAt(1000), 150)).toBe(500);
  });

  test('each segment has the opacity of the age at its middle: 50% fresh, none at 800 ms; the head 70% of its freshness', () => {
    const moment = momentAt(500);
    const shapes = ShimmerShapeUtil.shimmerShapesAt(moment);
    const segmentLength = (126 - 100) / 4;
    shapes.slice(0, 4).forEach((shape, i) => {
      const middleX = 100 + ((i + 0.5) * segmentLength);
      expect(shape.opacity).toBeCloseTo(0.5 * (1 - (ShimmerShapeUtil.ageAt(moment, middleX) / 800)), 10);
    });
    expect(shapes[4]?.opacity).toBeCloseTo(0.7 * (1 - (ShimmerShapeUtil.ageAt(moment, 129) / 800)), 10);
  });

  test('the tail that faded is not drawn, and the shimmer then has no rounded tail', () => {
    const shapes = ShimmerShapeUtil.shimmerShapesAt(momentAt(2000));
    const first = shapes[0]?.kind === 'path' ? shapes[0].pathData : '';
    expect(first).toStartWith('M220 40');
    expect(first.match(/A/g)).toBeNull();
    expect(shapes[0]?.opacity).toBeCloseTo(0.5 * (1 - (ShimmerShapeUtil.ageAt(momentAt(2000), 220 + (((276 - 220) / 4) / 2)) / 800)), 10);
  });
});
