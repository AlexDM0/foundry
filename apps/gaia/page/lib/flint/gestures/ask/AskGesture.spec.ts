/**
 * Needs an answer: in `ask` Flint holds up the card as it bobs and turns, and in `ask-knock` it faces the user and knocks with the other
 * hand. Both loop, and reduced motion holds a still moment of each.
 */
import { describe, expect, test } from 'bun:test';

import type { GestureInput } from '../GestureDefinition.ts';
import { ASK_GESTURE }       from './AskGesture.ts';

function inputAt(elapsedMilliseconds: number, variant: 'normal' | 'knock'): GestureInput<'normal' | 'knock'> {
  return {
    elapsedMilliseconds, variant, facing: 1, sidewaysWidth: 1, target: null, verdict: null,
  };
}

describe('ask', () => {
  test('one pentagon of radius 6 is held to the card, with no far hand', () => {
    const part = ASK_GESTURE.targetPose(inputAt(500, 'normal'));
    expect(part.nearHand).toMatchObject({ cornerCount: 5, radius: 6, placement: { heldTo: 'askCard' } });
    expect(part.farHand).toBeNull();
  });

  test('the card bobs by 1.5 × sin(t / 300) and turns 4 × sin(t / 600) degrees, at full size', () => {
    const card = ASK_GESTURE.targetPose(inputAt(500, 'normal')).props?.askCard;
    expect(card?.scale).toBe(1);
    expect(card?.offsetY).toBeCloseTo(1.5 * Math.sin(500 / 300));
    expect(card?.turnDegrees).toBeCloseTo(4 * Math.sin(500 / 600));
  });

  test('the body leans 3 and the eyes are 8 high, shifted 3; in the last 400 ms of each 3 seconds Flint looks at the card', () => {
    const part = ASK_GESTURE.targetPose(inputAt(1000, 'normal'));
    expect(part.body?.leanDegrees).toBe(3);
    expect(part.eyes).toEqual({ height: 8, shift: 3 });
    expect(ASK_GESTURE.targetPose(inputAt(2700, 'normal')).eyes?.shift).toBe(6);
    expect(ASK_GESTURE.targetPose(inputAt(3100, 'normal')).eyes?.shift).toBe(3);
    expect(ASK_GESTURE.targetPose(inputAt(5700, 'normal')).eyes?.shift).toBe(6);
  });
});

describe('ask and knock', () => {
  test('Flint faces the user: lean 0, eye shift 0, eye height 9', () => {
    const part = ASK_GESTURE.targetPose(inputAt(1000, 'knock'));
    expect(part.body?.leanDegrees).toBe(0);
    expect(part.eyes).toEqual({ height: 9, shift: 0 });
  });

  test('the far hand holds the card at 85% and 6 units lower; the card does not sway', () => {
    const part = ASK_GESTURE.targetPose(inputAt(1000, 'knock'));
    expect(part.farHand).toMatchObject({ cornerCount: 5, placement: { heldTo: 'askCard' } });
    expect(part.props?.askCard).toEqual({
      shown: 1, scale: 0.85, offsetY: 6, turnDegrees: 0,
    });
  });

  test('between knocks the knuckle is a square of radius 5.5 at (26, -38), turn 0, and nothing lifts or shows', () => {
    const part = ASK_GESTURE.targetPose(inputAt(100, 'knock'));
    expect(part.nearHand).toMatchObject({
      cornerCount: 4, centreX: 26, centreY: -38, radius: 5.5, turnDegrees: 0,
    });
    expect(part.body?.addedLift).toBe(0);
    expect(part.props?.knockArcs?.opacity).toBe(0);
  });

  test('a knock at 200 and at 420 of each 1600 ms: radius 7.5 and a lift of 1 at its middle, the arcs fading over 200 ms', () => {
    for (const middleOfKnock of [245, 465, 1600 + 245]) {
      const part = ASK_GESTURE.targetPose(inputAt(middleOfKnock, 'knock'));
      expect(part.nearHand?.radius).toBeCloseTo(7.5);
      expect(part.body?.addedLift).toBeCloseTo(1);
      expect(part.props?.knockArcs?.opacity).toBeCloseTo(1 - (45 / 200));
    }
    expect(ASK_GESTURE.targetPose(inputAt(300, 'knock')).nearHand?.radius).toBeCloseTo(5.5);
    expect(ASK_GESTURE.targetPose(inputAt(300, 'knock')).props?.knockArcs?.opacity).toBeCloseTo(0.5);
    expect(ASK_GESTURE.targetPose(inputAt(700, 'knock')).props?.knockArcs?.opacity).toBe(0);
  });
});

test('both are loops; reduced motion holds 0 for ask and the middle of the first knock for ask and knock', () => {
  expect(Object.entries(ASK_GESTURE.intents).map(([intent, form]) => [intent, form.variant, form.durationMilliseconds, form.stillMomentMilliseconds])).toEqual([
    ['ask', 'normal', null, 0],
    ['ask-knock', 'knock', null, 245],
  ]);
});
