/** A steady move along the floor. What matters: a step moves at the speed for the frame, never overshoots, and faces its way. */
import { expect, test } from 'bun:test';

import { MovementUtil } from './MovementUtil.ts';

test('a step moves at the speed for the frame and never overshoots its point', () => {
  expect(MovementUtil.stepToward(0, 100, 1000, 16)).toBe(16);
  expect(MovementUtil.stepToward(0, -100, 1000, 16)).toBe(-16);
  expect(MovementUtil.stepToward(95, 100, 1000, 16)).toBe(100);
});

test('the direction and the facing point the way to the target; on the target the facing stays', () => {
  expect([MovementUtil.directionToward(5, 10), MovementUtil.directionToward(5, 1), MovementUtil.directionToward(5, 5)]).toEqual([1, -1, 0]);
  expect([MovementUtil.facingToward(5, 1, 1), MovementUtil.facingToward(5, 5, -1)]).toEqual([-1, -1]);
});
