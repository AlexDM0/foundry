/**
 * Fasten. What matters: the bolt shows; one hexagon of radius 8 at (31, -24) waits for the first
 * 15% of each 1.2 second cycle, turns 60 degrees in a straight line during the next 45%, then waits; the eyes are 5 high.
 */
import { expect, test } from 'bun:test';

import type { GestureInput } from '../GestureDefinition.ts';
import { FASTEN_GESTURE }    from './FastenGesture.ts';

function inputAt(elapsedMilliseconds: number): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing: 1, sidewaysWidth: 1, target: null, verdict: null,
  };
}

function turnAt(elapsedMilliseconds: number): number | undefined {
  return FASTEN_GESTURE.targetPose(inputAt(elapsedMilliseconds)).nearHand?.turnDegrees;
}

test('one hexagon of radius 8 at (31, -24) turns the bolt, which shows; there is no far hand', () => {
  const part = FASTEN_GESTURE.targetPose(inputAt(0));
  expect(part.nearHand).toMatchObject({
    cornerCount: 6, centreX: 31, centreY: -24, radius: 8, placement: 'eased',
  });
  expect(part.farHand).toBeNull();
  expect(part.props?.bolt).toEqual({ shown: 1 });
});

test('the hand waits for 15% of the cycle, turns 60 degrees during the next 45%, then waits', () => {
  expect(turnAt(0)).toBe(0);
  expect(turnAt(180)).toBe(0);
  expect(turnAt(180 + 135)).toBeCloseTo(15);
  expect(turnAt(180 + 270)).toBeCloseTo(30);
  expect(turnAt(720)).toBeCloseTo(60);
  expect(turnAt(1100)).toBeCloseTo(60);
});

test('each cycle starts again from a turn that looks the same, since a hexagon repeats every 60 degrees', () => {
  expect(turnAt(1200)).toBe(0);
  expect(turnAt(1200 + 450)).toBeCloseTo(turnAt(450) ?? Number.NaN);
});

test('the eyes are 5 high, and Flint takes the working lean and eye shift', () => {
  const part = FASTEN_GESTURE.targetPose(inputAt(0));
  expect(part.eyes).toEqual({ shift: 6, height: 5 });
  expect(part.body?.leanDegrees).toBe(5);
});
