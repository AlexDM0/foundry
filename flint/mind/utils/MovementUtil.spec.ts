/**
 * A steady move along the floor, and a floor that changes. What matters: a step moves at the speed for the frame, never overshoots, and
 * faces its way; a floor moves towards its goal at the body rate and is there once within half a unit; a lift above the floor is never
 * negative, comes down at the body rate, and is gone at once under reduced motion.
 */
import { expect, test } from 'bun:test';

import { MovementUtil } from './MovementUtil.ts';

const BODY_FRACTION_OF_A_FRAME = 1 - Math.exp(-7 * 0.016);

test('a step moves at the speed for the frame and never overshoots its point', () => {
  expect(MovementUtil.stepToward(0, 100, 1000, 16)).toBe(16);
  expect(MovementUtil.stepToward(0, -100, 1000, 16)).toBe(-16);
  expect(MovementUtil.stepToward(95, 100, 1000, 16)).toBe(100);
});

test('the direction and the facing point the way to the target; on the target the facing stays', () => {
  expect([MovementUtil.directionToward(5, 10), MovementUtil.directionToward(5, 1), MovementUtil.directionToward(5, 5)]).toEqual([1, -1, 0]);
  expect([MovementUtil.facingToward(5, 1, 1), MovementUtil.facingToward(5, 5, -1)]).toEqual([-1, -1]);
});

test('a floor moves towards its goal at the body rate, and is there once it is within half a unit', () => {
  expect(MovementUtil.floorTowards(600, 700, 16)).toBeCloseTo(600 + (100 * BODY_FRACTION_OF_A_FRAME), 10);
  expect(MovementUtil.floorTowards(699.6, 700, 16)).toBe(700);
});

test('a lift is how far Flint stands above the floor, never below it', () => {
  expect([MovementUtil.liftAbove(630, 700), MovementUtil.liftAbove(710, 700)]).toEqual([70, 0]);
});

test('a lift comes down at the body rate, and at once under reduced motion', () => {
  expect(MovementUtil.loweredLiftOf(70, 16, false)).toBeCloseTo(70 * (1 - BODY_FRACTION_OF_A_FRAME), 10);
  expect(MovementUtil.loweredLiftOf(0.3, 16, false)).toBe(0);
  expect(MovementUtil.loweredLiftOf(70, 16, true)).toBe(0);
});
