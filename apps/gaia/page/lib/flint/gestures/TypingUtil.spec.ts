/**
 * Typing as every gesture that types shares it. What matters: each square sits on its own key, at its own radius, turned 45 degrees; the far
 * hand taps opposite to the near hand; a slower divisor slows the tap; and the part of normal typing is exactly what Type gives in its normal
 * variant, so Gate failed, Sandbox and Wind-down type as Type does.
 */
import { expect, test } from 'bun:test';

import type { GestureInput } from './GestureDefinition.ts';
import { TypingUtil }        from './TypingUtil.ts';
import { TYPE_GESTURE }      from './type/TypeGesture.ts';

const typeInputAt = (elapsedMilliseconds: number): GestureInput<'normal'> => ({
  elapsedMilliseconds, variant: 'normal', facing: 1, sidewaysWidth: 1, target: null, verdict: null,
});

test('each square sits on its own key, turned 45 degrees', () => {
  expect(TypingUtil.handOnKeyOf('near', 0)).toEqual({
    cornerCount: 4, centreX: 22, centreY: -10, radius: 6.4, turnDegrees: 45, placement: 'eased',
  });
  expect(TypingUtil.handOnKeyOf('far', -2)).toMatchObject({ centreX: 30, centreY: -15, radius: 5.8 });
});

test('the far hand taps opposite to the near hand, and a slower divisor slows the tap', () => {
  const quarterTurnMilliseconds = 64 * (Math.PI / 2);
  expect(TypingUtil.alternatingTapOf('near', quarterTurnMilliseconds, 4, 64)).toBeCloseTo(-4, 9);
  expect(TypingUtil.alternatingTapOf('far', quarterTurnMilliseconds, 4, 64)).toBeCloseTo(0, 9);
  expect(TypingUtil.alternatingTapOf('near', quarterTurnMilliseconds, 4, 128)).toBeCloseTo(-2 * (1 + Math.SQRT1_2), 9);
});

test('the part of normal typing is what Type gives in its normal variant', () => {
  for (const elapsedMilliseconds of [0, 100, 250, 1000]) {
    expect(TypingUtil.normalTypingPartOf(elapsedMilliseconds)).toEqual(TYPE_GESTURE.targetPose(typeInputAt(elapsedMilliseconds)));
  }
});
