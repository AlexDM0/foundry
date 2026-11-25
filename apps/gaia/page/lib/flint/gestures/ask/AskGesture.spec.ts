/**
 * Needs an answer. What matters: in `ask` one pentagon of radius 6 is held to the card, the card bobs by
 * 1.5 × sin(t / 300) and turns back from upright by 4 × (1 + sin(t / 600)) / 2 around the hand, so its drawn far edge, stroke
 * included, stays within the gesture's forward reach through a whole sway, the body leans 3, the eyes are 8 high and shifted 3, and in the last
 * 400 ms of each 3 seconds shifted 6; in `ask-knock` Flint faces the user (lean 0, shift 0, height 9), the far hand holds the card at 85%
 * and 6 lower, and a square of radius 5.5 at (26, -38) knocks at 200 and 420 of each 1600 ms: to radius 7.5 and back in 90 ms with a
 * lift of 1, with arcs that fade in 200 ms. Both loop; reduced motion holds 0 and 245.
 */
import { describe, expect, test } from 'bun:test';

import type { GestureInput }        from '../GestureDefinition.ts';
import { ASK_GESTURE }              from './AskGesture.ts';
import { ASK_CARD_SHAPE, ASK_POSE } from './constants/AskValues.ts';

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

  test('the card bobs by 1.5 × sin(t / 300) and turns back by 4 × (1 + sin(t / 600)) / 2 degrees, at full size', () => {
    const card = ASK_GESTURE.targetPose(inputAt(500, 'normal')).props?.askCard;
    expect(card?.scale).toBe(1);
    expect(card?.offsetY).toBeCloseTo(1.5 * Math.sin(500 / 300));
    expect(card?.turnDegrees).toBeCloseTo(-4 * (1 + Math.sin(500 / 600)) / 2);
  });

  test('the card\'s drawn far edge, its stroke included, stays within the forward reach through a whole sway', () => {
    const fullSwayMilliseconds = 2 * Math.PI * ASK_POSE.TURN_DIVISOR_MILLISECONDS;
    const hold = { x: ASK_CARD_SHAPE.X_UNITS, y: ASK_CARD_SHAPE.Y_UNITS + ASK_CARD_SHAPE.HEIGHT_UNITS + ASK_CARD_SHAPE.HOLD_BELOW_CORNER_UNITS };
    const farEdgeX = ASK_CARD_SHAPE.X_UNITS + ASK_CARD_SHAPE.WIDTH_UNITS;
    const farCorners = [ASK_CARD_SHAPE.Y_UNITS, ASK_CARD_SHAPE.Y_UNITS + ASK_CARD_SHAPE.HEIGHT_UNITS].map((cornerY) => ({ x: farEdgeX, y: cornerY }));
    const farthestX = Math.max(...Array.from({ length: 100 }, (_unused, i) => {
      const turnDegrees = ASK_GESTURE.targetPose(inputAt((i / 100) * fullSwayMilliseconds, 'normal')).props?.askCard?.turnDegrees ?? 0;
      const radians = (turnDegrees * Math.PI) / 180;
      return Math.max(...farCorners.map((corner) => hold.x + ((corner.x - hold.x) * Math.cos(radians)) - ((corner.y - hold.y) * Math.sin(radians))));
    }));
    expect(farthestX + (ASK_CARD_SHAPE.STROKE_UNITS / 2)).toBeLessThanOrEqual(ASK_GESTURE.forwardReachUnits ?? 0);
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
