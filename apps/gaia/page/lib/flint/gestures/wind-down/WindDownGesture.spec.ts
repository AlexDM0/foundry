/**
 * Wind-down. What matters: 0 to 500 normal typing with `sin(t / 120)`; 500 to 1700 the near
 * hand is a hexagon of 6.5 on the dial at (40, -40), and from 700 it and the pointer turn 60 degrees down in 200 ms in each of three steps
 * of 330 ms (pointer 60 to -120) while the far hand types with `sin(t / 200)`, then `sin(t / 320)`, then stops, and the eyes are 6, 5, 4;
 * 1700 to 2100 the dial fades and the hands go; 2100 to 2900 a small ticket fades in and the pen writes one more line in 600 ms,
 * from its left end on the screen facing either way; 2900 to 3200 the ticket moves by (14, -6) and fades, eye height 3.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { WIND_DOWN_GESTURE } from './WindDownGesture.ts';

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number, facing: Facing = 1) => WIND_DOWN_GESTURE.targetPose(inputAt(elapsedMilliseconds, facing));

describe('the slow typing and the dial', () => {
  test('0 to 500: both squares type in the normal mood, but with sin(t / 120); lean 5, eyes 6 and lift 2', () => {
    const part = partAt(200);
    const swing = 0.5 * Math.sin(200 / 120);
    expect(part.nearHand).toMatchObject({
      cornerCount: 4, centreX: 22, radius: 6.4, turnDegrees: 45
    });
    expect(part.nearHand?.centreY).toBeCloseTo(-10 - (4 * (0.5 + swing)), 9);
    expect(part.farHand?.centreY).toBeCloseTo(-13 - (4 * (0.5 - swing)), 9);
    expect(part.body).toEqual({ leanDegrees: 5 });
    expect(part.eyes).toEqual({ height: 6, lift: 2, shift: 6 });
    expect(part.props?.keyboard).toEqual({ shown: 1, drop: 0 });
  });

  test('from 500 the near hand is a hexagon of 6.5 on the dial, which fades in by 700 with its pointer at 60 degrees', () => {
    const part = partAt(600);
    expect(part.nearHand).toEqual({
      cornerCount: 6, centreX: 40, centreY: -40, radius: 6.5, turnDegrees: -0, placement: 'eased',
    });
    expect(part.props?.windDownDial).toEqual({ shown: 1, pointerDegrees: 60, fade: 0.5 });
  });

  test.each([
    [800, -30, 6],
    [950, -60, 6],
    [1130, -90, 5],
    [1600, -180, 4],
  ])('at %i ms the hand has turned %d degrees, and the eyes are %i', (elapsedMilliseconds, turnDegrees, eyeHeight) => {
    const part = partAt(elapsedMilliseconds);
    expect(part.nearHand?.turnDegrees).toBeCloseTo(turnDegrees, 9);
    expect(part.props?.windDownDial?.pointerDegrees).toBeCloseTo(60 + turnDegrees, 9);
    expect(part.eyes?.height).toBe(eyeHeight);
  });

  test('the far hand types slower after each step, and stops after the last', () => {
    const farTapAt = (elapsedMilliseconds: number, divisor: number) => -13 - (4 * (0.5 - (0.5 * Math.sin(elapsedMilliseconds / divisor))));
    expect(partAt(850).farHand?.centreY).toBeCloseTo(farTapAt(850, 120), 9);
    expect(partAt(1000).farHand?.centreY).toBeCloseTo(farTapAt(1000, 200), 9);
    expect(partAt(1300).farHand?.centreY).toBeCloseTo(farTapAt(1300, 320), 9);
    expect(partAt(1650).farHand?.centreY).toBe(-13);
  });

  test('1700 to 2100 the hands go away, the keyboard is no longer given and the dial fades out', () => {
    const part = partAt(1900);
    expect([part.nearHand, part.farHand]).toEqual([null, null]);
    expect(part.props?.keyboard).toBeUndefined();
    expect(part.props?.windDownDial?.fade).toBeCloseTo(0.5, 9);
  });
});

describe('the last ticket', () => {
  test('it fades in from 2100; the pen writes the fourth line from 2300 in 600 ms', () => {
    expect(partAt(2250).props?.windDownTicket).toMatchObject({ fade: 0.5, writtenLength: 0 });
    expect(partAt(2600).props?.windDownTicket?.writtenLength).toBeCloseTo(6, 9);
    expect(partAt(2600).nearHand).toMatchObject({ cornerCount: 3, radius: 5.5, turnDegrees: -35 });
  });

  test('the pen sits right of the growing end on the screen, at the ticket\'s scale, facing either way', () => {
    // The end of the line is at (31 + 6, -16 + 1.2) on the ticket, which is drawn at 80% around (38, -28).
    const endX = 38 + (0.8 * (37 - 38));
    const endY = -28 + (0.8 * (-14.8 + 28));
    const right = partAt(2600, 1).nearHand;
    expect(right?.centreX).toBeCloseTo(endX + 3, 9);
    expect(right?.centreY).toBeCloseTo(endY + 5 + (0.6 * Math.sin(2600 / 40)), 9);
    const left = partAt(2600, -1).nearHand;
    expect(left?.centreX).toBeCloseTo(endX - 3, 9);
    expect(left?.turnDegrees).toBe(35);
  });

  test('2900 to 3200 the ticket moves by (14, -6) and fades out; the hand goes; eye height 3', () => {
    const part = partAt(3050);
    expect(part.props?.windDownTicket).toMatchObject({
      offsetX: 7, offsetY: -3, fade: 0.5, writtenLength: 12
    });
    expect(part.nearHand).toBeNull();
    expect(part.eyes).toEqual({ height: 3, shift: 6 });
  });
});

test('one action of 3200 ms; reduced motion holds 1500, on the dial', () => {
  expect(WIND_DOWN_GESTURE.intents['wind-down']).toEqual({ variant: 'normal', durationMilliseconds: 3200, stillMomentMilliseconds: 1500 });
  expect(partAt(1500).nearHand?.cornerCount).toBe(6);
});
