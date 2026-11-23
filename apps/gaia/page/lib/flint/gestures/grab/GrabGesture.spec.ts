/**
 * Grab. What matters: the two pentagons reach to the target, no further than 44 units from the body
 * centre (0, -24), spread by 9 and then by 4 after 0.25 seconds; the eyes look at the target; the catch is taken once at 0.25 seconds
 * and holds a target nearer than 58 units; the eyes open to 10 on a catch and narrow to 4 on a miss; the grab ends after 0.9 seconds.
 */
import { describe, expect, test } from 'bun:test';
import type { Point }             from '../../SpriteGeometry.ts';

import type { GestureInput } from '../GestureDefinition.ts';
import { GRAB_GESTURE }      from './GrabGesture.ts';

function inputAt(elapsedMilliseconds: number, target: Point | null, verdict: boolean | null = null): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing: 1, sidewaysWidth: 1, target, verdict,
  };
}

describe('the reach', () => {
  test('a target within reach is the goal: the near hand at goal + 9 × (0.7, 0.5), the far hand at goal - 9 × (0.7, 0.5)', () => {
    const part = GRAB_GESTURE.targetPose(inputAt(100, { x: 20, y: -30 }));
    expect(part.nearHand).toMatchObject({ cornerCount: 5, radius: 7, turnDegrees: 0 });
    expect(part.farHand).toMatchObject({ cornerCount: 5, radius: 6.3, turnDegrees: 0 });
    expect(part.nearHand?.centreX).toBeCloseTo(20 + 6.3);
    expect(part.nearHand?.centreY).toBeCloseTo(-30 + 4.5);
    expect(part.farHand?.centreX).toBeCloseTo(20 - 6.3);
    expect(part.farHand?.centreY).toBeCloseTo(-30 - 4.5);
  });

  test('after 0.25 seconds the hands close to a spread of 4', () => {
    const part = GRAB_GESTURE.targetPose(inputAt(250, { x: 20, y: -30 }));
    expect(part.nearHand?.centreX).toBeCloseTo(20 + 2.8);
    expect(part.farHand?.centreY).toBeCloseTo(-30 - 2);
  });

  test('a target out of reach gives a goal 44 units from the body centre, on the line to the target', () => {
    const part = GRAB_GESTURE.targetPose(inputAt(300, { x: 100, y: -24 }));
    expect(part.nearHand?.centreX).toBeCloseTo(44 + 2.8);
    expect(part.nearHand?.centreY).toBeCloseTo(-24 + 2);
  });

  test('with no target, Flint reaches straight ahead as far as it can', () => {
    const part = GRAB_GESTURE.targetPose(inputAt(300, null));
    expect(part.nearHand?.centreX).toBeCloseTo(44 + 2.8);
    expect(part.farHand?.centreX).toBeCloseTo(44 - 2.8);
  });
});

describe('the eyes', () => {
  test('the eye lift is the vertical distance from the body centre to the target / 30, between -3 and 2', () => {
    expect(GRAB_GESTURE.targetPose(inputAt(0, { x: 20, y: 6 })).eyes?.lift).toBeCloseTo(1);
    expect(GRAB_GESTURE.targetPose(inputAt(0, { x: 20, y: 200 })).eyes?.lift).toBe(2);
    expect(GRAB_GESTURE.targetPose(inputAt(0, { x: 20, y: -300 })).eyes?.lift).toBe(-3);
  });

  test('before the catch the eye height is left to the layers below; a catch opens the eyes to 10, a miss narrows them to 4', () => {
    expect(GRAB_GESTURE.targetPose(inputAt(100, { x: 20, y: -30 })).eyes?.height).toBeUndefined();
    expect(GRAB_GESTURE.targetPose(inputAt(400, { x: 20, y: -30 }, true)).eyes?.height).toBe(10);
    expect(GRAB_GESTURE.targetPose(inputAt(400, { x: 90, y: -30 }, false)).eyes?.height).toBe(4);
  });

  test('Flint leans 5 degrees and shifts its eyes 6 units to the work', () => {
    const part = GRAB_GESTURE.targetPose(inputAt(0, { x: 20, y: -30 }));
    expect(part.body?.leanDegrees).toBe(5);
    expect(part.eyes?.shift).toBe(6);
  });
});

describe('the catch', () => {
  test('the catch is taken once, when the hands close at 0.25 seconds', () => {
    expect(GRAB_GESTURE.verdict?.momentMilliseconds).toBe(250);
  });

  test('Flint has a target that is less than 58 units from the body centre, and not one further away', () => {
    const caught = (target: Point | null): boolean | undefined => GRAB_GESTURE.verdict?.verdictOf(inputAt(250, target));
    expect(caught({ x: 57.9, y: -24 })).toBe(true);
    expect(caught({ x: 0, y: -24 + 57.9 })).toBe(true);
    expect(caught({ x: 58, y: -24 })).toBe(false);
    expect(caught({ x: 70, y: -24 })).toBe(false);
  });

  test('with no target, the hands close on nothing', () => {
    expect(GRAB_GESTURE.verdict?.verdictOf(inputAt(250, null))).toBe(false);
  });

  test('the grab is one action of 0.9 seconds, after which the hands go away', () => {
    expect(GRAB_GESTURE.intents.grab.durationMilliseconds).toBe(900);
  });

  test('under reduced motion the grab holds its closed hands', () => {
    expect(GRAB_GESTURE.intents.grab.stillMomentMilliseconds).toBe(250);
  });
});
