/**
 * The easing a prop gets by default. What matters: only the shown level eases, by the share of the distance given; a prop the target
 * shows takes the target's other values at once; one the target hides keeps its last drawn values while it fades.
 */
import { expect, test } from 'bun:test';

import { PropEasingUtil } from './PropEasingUtil.ts';

test('one step covers its share of the distance', () => {
  expect(PropEasingUtil.easedTowards(10, 20, 0.25)).toBe(12.5);
});

test('a shown prop eases its level and takes the target\'s other values', () => {
  expect(PropEasingUtil.easedShownLevelOf({ shown: 0, drop: 0 }, { shown: 1, drop: 1.6 }, 0.5)).toEqual({ shown: 0.5, drop: 1.6 });
});

test('a hidden prop fades in its last drawn look', () => {
  expect(PropEasingUtil.easedShownLevelOf({ shown: 1, drop: 1.6 }, { shown: 0, drop: 0 }, 0.5)).toEqual({ shown: 0.5, drop: 1.6 });
});
