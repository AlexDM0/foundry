/**
 * Assistant intercept. What matters: the envelope fades in over 300 ms as it flies in
 * turned -20 degrees, so it never shows at once at the start of a cycle, and
 * two pentagons reach for it from 450 with wide eyes; at 700 it is caught exactly where the flight ends, with a hop of 4; it is pulled to
 * (28, -30) as the far hand goes and the near hand holds its lower corner; it opens and its paper rises while Flint reads; then the outcome
 * alternates by cycle, handled first (paper back, envelope into Flint, tick, happy eyes) and passed up next (lifted, flown up and faded,
 * eyes up); the hands go at 3200; reduced motion holds the reading; the part does not depend on the facing.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }                           from '../../SpriteGeometry.ts';
import type { GestureInput }                     from '../GestureDefinition.ts';
import { INTERCEPT_GESTURE, interceptOutcomeOf } from './InterceptGesture.ts';

const CYCLE_MILLISECONDS = 3800;

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number, facing: Facing = 1) => INTERCEPT_GESTURE.targetPose(inputAt(elapsedMilliseconds, facing));
const envelopeAt = (elapsedMilliseconds: number) => partAt(elapsedMilliseconds).props?.interceptEnvelope;

test('intercept is one loop that reduced motion holds at 1500', () => {
  expect(INTERCEPT_GESTURE.intents.intercept).toMatchObject({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 1500 });
});

test('the outcome alternates by cycle, handled first', () => {
  expect([0, CYCLE_MILLISECONDS, 2 * CYCLE_MILLISECONDS].map(interceptOutcomeOf)).toEqual(['handled', 'passed-up', 'handled']);
});

describe('the catch and the reading', () => {
  test('0 to 700: the envelope flies from (36, -20) to (30, -38), turned -20 degrees, closed; no hand before 450', () => {
    expect(envelopeAt(350)).toMatchObject({
      x: 33, y: -29, turnDegrees: -20, scale: 1, flapDepth: 5, paperRise: 0,
    });
    expect(partAt(350).nearHand).toBeNull();
    expect(partAt(350).farHand).toBeNull();
  });

  test('from 450 two pentagons reach for it, their spread closing from 9 to 4, with eyes 10 high', () => {
    const part = partAt(450);
    const envelope = envelopeAt(450);
    expect(part.eyes).toEqual({ height: 10 });
    expect(part.nearHand).toMatchObject({ cornerCount: 5, radius: 7, placement: 'eased' });
    expect(part.farHand).toMatchObject({ cornerCount: 5, radius: 6.3, placement: 'eased' });
    expect(part.farHand?.centreX).toBeCloseTo((envelope?.x ?? 0) + 7 + 6.3);
    expect(part.farHand?.centreY).toBeCloseTo((envelope?.y ?? 0) + 4.5 - 4.5);
    expect(part.nearHand?.centreX).toBeCloseTo((envelope?.x ?? 0) - 4 - 3.5);
    expect(part.nearHand?.centreY).toBeCloseTo((envelope?.y ?? 0) + 6 + 2.5);
  });

  test('700: the catch places the envelope exactly at (30, -38); a hop of 4 follows; the near hand holds it', () => {
    expect(envelopeAt(700)).toMatchObject({ x: 30, y: -38, turnDegrees: -20 });
    expect(partAt(850).body?.addedLift).toBeCloseTo(4);
    expect(partAt(700).nearHand?.placement).toEqual({ heldTo: 'interceptEnvelope' });
  });

  test('700 to 1000: the hands pull it to (28, -30) and turn it level; the far hand goes away', () => {
    expect(envelopeAt(1000)).toMatchObject({ x: 28, y: -30, turnDegrees: 0 });
    expect(partAt(849).farHand).not.toBeNull();
    expect(partAt(850).farHand).toBeNull();
  });

  test('1000 to 2200: the flap opens, the paper rises 6 out of it, and Flint reads', () => {
    expect(envelopeAt(1125)?.flapDepth).toBeCloseTo(0);
    expect(envelopeAt(1250)?.flapDepth).toBe(-5);
    expect(envelopeAt(1375)?.paperRise).toBeCloseTo(3);
    expect(envelopeAt(1500)?.paperRise).toBe(6);
    expect(partAt(1800).eyes).toEqual({ height: 5, lift: 1, shift: 6 + Math.sin(1800 / 150) });
    expect(partAt(1800).body).toEqual({ leanDegrees: 5 });
  });
});

describe('handled, in the first cycle', () => {
  test('2200 to 2500: the paper goes back while the hand still holds the envelope', () => {
    expect(envelopeAt(2350)?.paperRise).toBeCloseTo(3);
    expect(partAt(2350).nearHand?.placement).toEqual({ heldTo: 'interceptEnvelope' });
  });

  test('2500 to 3000: the envelope goes to (10, -22) and its scale to 0; the tick and the happy eyes show; the hand stays', () => {
    expect(envelopeAt(2750)).toMatchObject({
      x: 19, y: -26, scale: 0.5, tickOpacity: 1,
    });
    expect(partAt(2750).eyes).toEqual({ happiness: 1 });
    expect(partAt(2750).nearHand).toMatchObject({ centreX: 24, centreY: -24, placement: 'eased' });
  });

  test('3200 to 3800: the hand goes away and the tick fades', () => {
    expect(partAt(3500).nearHand).toBeNull();
    expect(envelopeAt(3500)?.tickOpacity).toBeCloseTo(0.5);
  });
});

describe('passed up, in the second cycle', () => {
  test('2200 to 2700: the hand lifts the envelope to (28, -44), the eyes looking up', () => {
    expect(envelopeAt(CYCLE_MILLISECONDS + 2450)).toMatchObject({ x: 28, y: -37, tickOpacity: 0 });
    expect(partAt(CYCLE_MILLISECONDS + 2450).nearHand?.placement).toEqual({ heldTo: 'interceptEnvelope' });
    expect(partAt(CYCLE_MILLISECONDS + 2450).eyes).toEqual({ lift: -3 });
  });

  test('2700 to 3200: the envelope flies up to y -50 and fades; the hand stays where it let go', () => {
    expect(envelopeAt(CYCLE_MILLISECONDS + 2950)).toMatchObject({ y: -47, envelopeOpacity: 0.5 });
    expect(partAt(CYCLE_MILLISECONDS + 2950).nearHand).toMatchObject({ centreX: 24, centreY: -38, placement: 'eased' });
  });
});

test('the envelope fades in over the first 300 ms of each cycle', () => {
  expect([0, 150, 300].map((time) => envelopeAt(CYCLE_MILLISECONDS + time)?.envelopeOpacity)).toEqual([0, 0.5, 1]);
});

test('reduced motion holds the reading of the risen paper, in the handled cycle', () => {
  const still = INTERCEPT_GESTURE.intents.intercept.stillMomentMilliseconds;
  expect(envelopeAt(still)).toMatchObject({ flapDepth: -5, paperRise: 6 });
  expect(partAt(still).eyes?.height).toBe(5);
});

test('facing left gives the same part', () => {
  for (const moment of [350, 1500, 2750, CYCLE_MILLISECONDS + 2950]) expect(partAt(moment, -1)).toEqual(partAt(moment, 1));
});
