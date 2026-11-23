/**
 * Held. What matters: until 500 the ticket fades in and the clamp slides 8 units down to its place,
 * with no hand; from 500 to 1100 one hexagon of radius 6 at (38, -52) turns 120 degrees with eye height 5; from 1100 on the hand is a
 * square of radius 7, turn 0, at (26, -34), moving by sin(t / 500), with lean 0, eye height 6 and eye shift 2. It runs until something
 * stops it, and reduced motion holds 2000.
 */
import { describe, expect, test } from 'bun:test';

import type { GestureInput } from '../GestureDefinition.ts';
import { HOLD_GESTURE }      from './HoldGesture.ts';

function inputAt(elapsedMilliseconds: number): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing: 1, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => HOLD_GESTURE.targetPose(inputAt(elapsedMilliseconds));

describe('the entrance', () => {
  test('until 500 the ticket fades in and the clamp slides 8 units down to its place, with no hand', () => {
    expect(partAt(0).props?.heldTicket).toEqual({ shown: 1, opacity: 0, clampOffsetY: -8 });
    expect(partAt(250).props?.heldTicket).toEqual({ shown: 1, opacity: 0.5, clampOffsetY: -4 });
    expect(partAt(500).props?.heldTicket).toEqual({ shown: 1, opacity: 1, clampOffsetY: -0 });
    expect(partAt(250).nearHand).toBeNull();
    expect(partAt(250).body?.leanDegrees).toBe(5);
  });

  test('from 500 to 1100 one hexagon of radius 6 at (38, -52) turns 120 degrees and fastens the clamp, with eye height 5', () => {
    const part = partAt(800);
    expect(part.nearHand).toMatchObject({
      cornerCount: 6, centreX: 38, centreY: -52, radius: 6, turnDegrees: 60,
    });
    expect(part.farHand).toBeNull();
    expect(part.eyes?.height).toBe(5);
    expect(partAt(1099).nearHand?.turnDegrees).toBeCloseTo(120, 0);
  });
});

describe('the steady pose', () => {
  test('from 1100 a flat palm: a square of radius 7, turn 0, at (26, -34 + sin(t / 500))', () => {
    for (const elapsedMilliseconds of [1100, 2000, 5300]) {
      const palm = partAt(elapsedMilliseconds).nearHand;
      expect(palm).toMatchObject({
        cornerCount: 4, centreX: 26, radius: 7, turnDegrees: 0,
      });
      expect(palm?.centreY).toBeCloseTo(-34 + Math.sin(elapsedMilliseconds / 500));
    }
  });

  test('Flint faces the user: lean 0, eye height 6, eye shift 2; the ticket stays clamped', () => {
    const part = partAt(3000);
    expect(part.body?.leanDegrees).toBe(0);
    expect(part.eyes).toEqual({ height: 6, shift: 2 });
    expect(part.props?.heldTicket).toEqual({ shown: 1, opacity: 1, clampOffsetY: -0 });
  });
});

test('it is a steady pose with an entrance, and reduced motion holds 2000', () => {
  const form = HOLD_GESTURE.intents.hold;
  expect([form.variant, form.durationMilliseconds, form.stillMomentMilliseconds]).toEqual(['normal', null, 2000]);
});
