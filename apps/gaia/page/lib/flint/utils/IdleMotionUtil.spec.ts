/** Idle: the hover swings 3 units around 6, and a blink shuts the eyes for 120 ms of every 4 seconds. */
import { expect, test } from 'bun:test';

import { IdleMotionUtil } from './IdleMotionUtil.ts';

test('the hover swings 3 units around a height of 6 with sin(t / 400)', () => {
  expect(IdleMotionUtil.hoverHeightAt(0)).toBe(6);
  expect(IdleMotionUtil.hoverHeightAt(200 * Math.PI)).toBeCloseTo(9);
  expect(IdleMotionUtil.hoverHeightAt(600 * Math.PI)).toBeCloseTo(3);
});

test('a blink shuts the eyes for the first 120 ms of each 4 seconds', () => {
  expect([0, 119, 120, 3999, 4000, 4119, 4120].map(IdleMotionUtil.blinkIsClosedAt)).toEqual([true, true, false, false, true, true, false]);
});
