/**
 * The spark companion against `06-more-animations.md`, "Spark companion". What matters: spark n sits at (-26 - 9 × (n mod 2), -44 + 11n);
 * it bobs by 2 × sin(t / 500 + 1.7n), turns 45 + 0.03 × t degrees and pulses by 1 + 0.08 × sin(t / 300 + n); it enters with the spring of
 * an emote mark in 200 ms; under reduced motion it holds still at scale 1; it draws one spark around its own centre; and the host can
 * give at most four.
 */
import { describe, expect, test } from 'bun:test';

import { WATCHER_SPARK_ATTENDANT } from './WatcherSparkAttendant.ts';

const settled = (index: number, elapsedMilliseconds: number, reducedMotion = false) => WATCHER_SPARK_ATTENDANT.memberPoseOf({
  index, ageMilliseconds: 1000, elapsedMilliseconds, reducedMotion,
});

describe('the place of each spark', () => {
  test.each([
    [0, -26, -44],
    [1, -35, -33],
    [2, -26, -22],
    [3, -35, -11],
  ])('spark %d rests at (%d, %d), behind Flint in a zigzag', (index, restX, restY) => {
    expect(settled(index, 0, true)).toEqual({
      x: restX, y: restY, turnDegrees: 45, scale: 1,
    });
  });
});

describe('the motion', () => {
  test('a spark bobs, turns and pulses on its own phase', () => {
    const pose = settled(1, 600);
    expect(pose.y).toBeCloseTo(-33 + (2 * Math.sin((600 / 500) + 1.7)), 9);
    expect(pose.turnDegrees).toBeCloseTo(45 + (0.03 * 600), 9);
    expect(pose.scale).toBeCloseTo(1 + (0.08 * Math.sin((600 / 300) + 1)), 9);
  });

  test('a spark enters with the spring of an emote mark: 0 when it joins, settled once 200 ms have passed', () => {
    const atJoin = WATCHER_SPARK_ATTENDANT.memberPoseOf({
      index: 0, ageMilliseconds: 0, elapsedMilliseconds: 5000, reducedMotion: false,
    });
    const settledScale = settled(0, 5000).scale;
    const afterSpring = WATCHER_SPARK_ATTENDANT.memberPoseOf({
      index: 0, ageMilliseconds: 200, elapsedMilliseconds: 5000, reducedMotion: false,
    });
    expect([atJoin.scale, afterSpring.scale]).toEqual([0, settledScale]);
  });
});

test('a member is one spark around its own centre, with its core, and the host can give at most four', () => {
  expect(WATCHER_SPARK_ATTENDANT.shapesOf().map((shape) => [shape.kind, shape.fill])).toEqual([['rectangle', 'body'], ['rectangle', 'emberLight']]);
  expect(WATCHER_SPARK_ATTENDANT.maximumCount).toBe(4);
});
