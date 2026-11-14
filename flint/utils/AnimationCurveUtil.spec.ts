/**
 * The shared curves against their own contract: the clamp's default bounds, a cycle that wraps also before zero, and the spring of
 * `02-animations.md` Emotes, which must start at nothing, overshoot, and rest at exactly 1 so a mark never jumps when the spring ends.
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

  test('half a turn in degrees is pi radians', () => {
    expect(AnimationCurveUtil.radiansOf(180)).toBeCloseTo(Math.PI);
  });
});
