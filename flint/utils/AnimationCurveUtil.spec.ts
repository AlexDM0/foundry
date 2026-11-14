/**
 * The shared curves against their own contract: the clamp's default bounds, a cycle that wraps also before zero, and the spring of
 * `02-animations.md` Emotes, which must start at nothing, overshoot, and rest at exactly 1 so a mark never jumps when the spring ends; and
 * the one interpolation every gesture and the easing step blend with.
 */
import { describe, expect, test } from 'bun:test';

import { AnimationCurveUtil } from './AnimationCurveUtil.ts';

describe('AnimationCurveUtil', () => {
  test('clamp holds a value between 0 and 1 unless other bounds are given', () => {
    expect(AnimationCurveUtil.clamp(1.4)).toBe(1);
    expect(AnimationCurveUtil.clamp(-0.2)).toBe(0);
    expect(AnimationCurveUtil.clamp(5, -3, 2)).toBe(2);
  });

  test('a cycle progress wraps at each cycle and also below zero', () => {
    expect(AnimationCurveUtil.cycleProgressOf(450, 300)).toBeCloseTo(0.5);
    expect(AnimationCurveUtil.cycleProgressOf(-75, 300)).toBeCloseTo(0.75);
  });

  test('the spring starts at nothing, overshoots past 1 and rests at exactly 1', () => {
    expect(AnimationCurveUtil.springScaleAt(0)).toBe(0);
    const samples = Array.from({ length: 20 }, (_unused, i) => AnimationCurveUtil.springScaleAt(i / 20));
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(AnimationCurveUtil.springScaleAt(1)).toBe(1);
  });

  test('one easing step covers 1 - exp(-rate × seconds) of the distance', () => {
    expect(AnimationCurveUtil.easingFractionOf(7, 100)).toBeCloseTo(1 - Math.exp(-0.7));
  });

  test('half a turn in degrees is pi radians', () => {
    expect(AnimationCurveUtil.radiansOf(180)).toBeCloseTo(Math.PI);
  });

  test('an interpolation gives the first value at 0, the second at 1, and goes past them outside that range', () => {
    expect([0, 0.25, 1, 1.5].map((share) => AnimationCurveUtil.interpolated(10, 30, share))).toEqual([10, 15, 30, 40]);
    expect(AnimationCurveUtil.interpolatedPoint({ x: 0, y: 10 }, { x: 8, y: -10 }, 0.25)).toEqual({ x: 2, y: 5 });
  });
});
