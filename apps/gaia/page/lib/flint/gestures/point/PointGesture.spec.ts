/**
 * Point. What matters: one triangle of radius 7 points forward (turn 90) and swings by
 * 4 × sin(t / 220) around (29, -25); there is no second hand; Flint leans and shifts its eyes into the working pose.
 */
import { expect, test } from 'bun:test';

import type { GestureInput } from '../GestureDefinition.ts';
import { POINT_GESTURE }     from './PointGesture.ts';

function inputAt(elapsedMilliseconds: number): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing: 1, sidewaysWidth: 1, target: null, verdict: null,
  };
}

test('one triangle of radius 7 points forward and swings by 4 × sin(t / 220) around (29, -25)', () => {
  for (const elapsedMilliseconds of [0, 100, 345, 1000]) {
    const part = POINT_GESTURE.targetPose(inputAt(elapsedMilliseconds));
    expect(part.nearHand?.cornerCount).toBe(3);
    expect(part.nearHand?.radius).toBe(7);
    expect(part.nearHand?.turnDegrees).toBe(90);
    expect(part.nearHand?.centreX).toBeCloseTo(29 + (4 * Math.sin(elapsedMilliseconds / 220)));
    expect(part.nearHand?.centreY).toBe(-25);
    expect(part.nearHand?.placement).toBe('eased');
  }
});

test('the far hand goes away: one hand is sufficient to point', () => {
  expect(POINT_GESTURE.targetPose(inputAt(0)).farHand).toBeNull();
});

test('Flint leans 5 degrees and shifts its eyes 6 units to the work', () => {
  const part = POINT_GESTURE.targetPose(inputAt(0));
  expect(part.body?.leanDegrees).toBe(5);
  expect(part.eyes?.shift).toBe(6);
});
