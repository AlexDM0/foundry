/**
 * The spark companion: where the sparks rest along Flint's back, how they bob, turn and pulse, how they enter, that reduced motion holds
 * them still, and that the host can give at most four.
 */
import { describe, expect, test } from 'bun:test';

import { WATCHER_SPARK_ATTENDANT } from './WatcherSparkAttendant.ts';

const settled = (index: number, elapsedMilliseconds: number, reducedMotion = false) => WATCHER_SPARK_ATTENDANT.memberPoseOf({
  index, ageMilliseconds: 1000, elapsedMilliseconds, reducedMotion,
});

describe('the place of each spark', () => {
  test.each([
    [0, -7, -49],
    [1, -13, -42],
    [2, -18, -34.5],
    [3, -22, -27],
  ])('spark %d rests at (%d, %d), up along Flint\'s back', (index, restX, restY) => {
    expect(settled(index, 0, true)).toEqual({
      x: restX, y: restY, turnDegrees: 45, scale: 1,
    });
  });
});

describe('the motion', () => {
  test('a spark bobs, turns and pulses on its own phase', () => {
    const pose = settled(1, 600);
    expect(pose.y).toBeCloseTo(-42 + (2 * Math.sin((600 / 500) + 1.7)), 9);
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
