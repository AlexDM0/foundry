/** Walking: 220 units per second along the floor, never past its ends, with the body height wobbling 4%. */
import { expect, test } from 'bun:test';

import { WalkMotionUtil } from './WalkMotionUtil.ts';

test('Flint walks 220 units in a second, either way', () => {
  expect(WalkMotionUtil.positionAfterStep(100, 1, 1000, 0, 1000)).toBe(320);
  expect(WalkMotionUtil.positionAfterStep(100, -1, 250, -1000, 1000)).toBe(45);
  expect(WalkMotionUtil.positionAfterStep(100, 0, 1000, 0, 1000)).toBe(100);
});

test('a walk stops at the ends of the floor', () => {
  expect(WalkMotionUtil.positionAfterStep(190, 1, 1000, 20, 200)).toBe(200);
  expect(WalkMotionUtil.positionAfterStep(30, -1, 1000, 20, 200)).toBe(20);
});

test('a floor narrower than Flint holds it in its middle', () => {
  expect(WalkMotionUtil.positionAfterStep(0, 1, 1000, 20, -20)).toBe(0);
});

test('the body height wobbles by 4% with sin(t / 55)', () => {
  expect(WalkMotionUtil.wobbleHeightFactorAt(0)).toBe(1);
  expect(WalkMotionUtil.wobbleHeightFactorAt(27.5 * Math.PI)).toBeCloseTo(1.04);
});
