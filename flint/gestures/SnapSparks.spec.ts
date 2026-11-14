/**
 * The sparks of the snap. What matters: four sparks on their ways from the snap's centre (34, -26), 7 across and 2 up or down at the snap, 14 and
 * 12 further by the end of their 450 ms flight, turning half a turn and fading; hidden outside the flight; a flare stretches the travel only.
 */
import { expect, test } from 'bun:test';

import { snapSparksAt } from './SnapSparks.ts';

test('the sparks fly out on their ways, turn and fade', () => {
  const halfway = snapSparksAt(225);
  expect(halfway[0]).toEqual({
    x: 34 - (7 + 7), y: -26 - (0.5 * (2 + 6)), turnDegrees: 90, opacity: 0.5,
  });
  expect(halfway[3]).toMatchObject({ x: 34 + 14, y: -26 + (0.6 * 8) });
});

test('no spark shows before the snap or after the flight', () => {
  expect(snapSparksAt(0).map((spark) => spark.opacity)).toEqual([0, 0, 0, 0]);
  expect(snapSparksAt(450).map((spark) => spark.opacity)).toEqual([0, 0, 0, 0]);
});

test('a flare from another centre stretches the travel, not the start', () => {
  expect(snapSparksAt(450 / 2, { x: 0, y: -24 }, 1.5)[1]).toMatchObject({ x: 7 + 10.5, y: -24 - (0.5 * (2 + 9)) });
});
