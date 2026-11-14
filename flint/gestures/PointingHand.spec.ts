/** The hand of Point. What matters: a triangle of radius 7 at (29, -25), turned 90 degrees, that swings forward by 4 × sin(t / 220). */
import { expect, test } from 'bun:test';

import { pointingHandAt } from './PointingHand.ts';

test('a triangle at (29, -25), turned 90 degrees, that swings by 4 × sin(t / 220)', () => {
  expect(pointingHandAt(0)).toEqual({
    cornerCount: 3, centreX: 29, centreY: -25, radius: 7, turnDegrees: 90, placement: 'eased',
  });
  expect(pointingHandAt(220 * (Math.PI / 2)).centreX).toBeCloseTo(33, 9);
});
