/**
 * Lay the bar. What matters: the bar grows as 10 + 26 × p² over the 1.4-second cycle and fades in its last 200 ms; one square behind Flint,
 * over the head of the bar, presses into it each 350 ms, 3 down and back in 120 ms, placed exactly; Flint looks back once a cycle; it goes
 * on while Flint walks and stops when Flint jumps; and reduced motion holds the middle of the cycle.
 */
import { expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { LAY_BAR_GESTURE }   from './LayBarGesture.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): ReturnType<typeof LAY_BAR_GESTURE.targetPose> {
  const input: GestureInput<'normal'> = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return LAY_BAR_GESTURE.targetPose(input);
}

test('the bar grows from 10 to 36 as 10 + 26 × p², and fades out in the last 200 ms of the cycle', () => {
  expect(partAt(0).props?.layBar).toEqual({ shown: 1, barLength: 10, barOpacity: 1 });
  expect(partAt(700).props?.layBar).toEqual({ shown: 1, barLength: 16.5, barOpacity: 1 });
  expect(partAt(1300).props?.layBar?.barOpacity).toBeCloseTo(0.5);
  expect(partAt(1400).props?.layBar).toEqual(partAt(0).props?.layBar);
});

test('the square stands over the bar, between its ends, and its lower corner goes into the bar at the bottom of a press', () => {
  const pressed = partAt(60).farHand;
  const barEnd = -18;
  const barHeadStart = barEnd - 6;
  expect(pressed?.centreX).toBeGreaterThan(barHeadStart);
  expect(pressed?.centreX).toBeLessThan(barEnd);
  expect((pressed?.centreY ?? 0) + 6).toBeGreaterThan(-4);
});

test('one square behind Flint, radius 6, turn 0, at (-21, -11) over the bar\'s head, presses 3 down and back in 120 ms each 350 ms', () => {
  expect(partAt(0).farHand).toEqual({
    cornerCount: 4, centreX: -21, centreY: -11, radius: 6, turnDegrees: 0, placement: 'exact-position',
  });
  expect(partAt(60).farHand?.centreY).toBeCloseTo(-8);
  expect(partAt(350 + 60).farHand?.centreY).toBeCloseTo(-8);
  expect(partAt(200).farHand?.centreY).toBe(-11);
  expect(partAt(0).nearHand).toBeNull();
});

test('lean 5, eye height 6, eye shift 6, and once a cycle Flint looks back for 300 ms', () => {
  expect(partAt(500).body).toEqual({ leanDegrees: 5 });
  expect(partAt(500).eyes).toEqual({ height: 6, shift: 6 });
  expect(partAt(950).eyes?.shift).toBe(-2);
  expect(partAt(1150).eyes?.shift).toBe(6);
});

test('the bar lies behind Flint whatever the facing: the renderer mirrors it', () => {
  expect(partAt(700, -1)).toEqual(partAt(700, 1));
});

test('one intent, a loop that goes on while Flint walks and stops when it jumps; reduced motion holds 700 ms', () => {
  expect(LAY_BAR_GESTURE.intents).toMatchObject({ 'lay-bar': { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 700 } });
  expect(LAY_BAR_GESTURE.continuesWhileWalking).toBe(true);
  expect(LAY_BAR_GESTURE.continuesWhileJumping).toBe(false);
});
