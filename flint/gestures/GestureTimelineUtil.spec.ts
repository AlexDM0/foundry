/**
 * The timeline of a cyclic gesture. What matters: a time wraps into its cycle, so a gesture repeats exactly; a phase is 0 before it starts,
 * 1 after it ends and straight between, so each phase of `02-animations.md` reads as a fraction.
 */
import { expect, test } from 'bun:test';

import { GestureTimelineUtil } from './GestureTimelineUtil.ts';

test('a time wraps into its cycle', () => {
  expect(GestureTimelineUtil.timeInCycleOf(0, 2600)).toBe(0);
  expect(GestureTimelineUtil.timeInCycleOf(2599, 2600)).toBe(2599);
  expect(GestureTimelineUtil.timeInCycleOf(2600 + 900, 2600)).toBe(900);
});

test('a phase is 0 before it starts, 1 after it ends, and straight between', () => {
  expect(GestureTimelineUtil.progressBetween(100, 350, 900)).toBe(0);
  expect(GestureTimelineUtil.progressBetween(625, 350, 900)).toBeCloseTo(0.5);
  expect(GestureTimelineUtil.progressBetween(1200, 350, 900)).toBe(1);
});
