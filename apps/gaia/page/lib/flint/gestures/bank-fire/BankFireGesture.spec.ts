/**
 * Bank the fire against `06-more-animations.md`, "Bank the fire". What matters: Flint lands (hover 0) and leans -5 from the start; a
 * square of 6.5, turn 0, at (-4, -59) over the leaned tip (the handoff's (10, -56) never reaches Flint) pats two times, 4 down and back
 * in 300 ms each, set exactly so its lower corner meets the tip; after the first pat the tint is cooled 0.3 and the
 * height × 0.97, after the second 0.6; from 800 the hand goes, the tint goes on to 0.7 and the eyes to 2.5 by 2000; from 2000 the glow is
 * 0.35 + 0.15 × sin(t / 900) (faded in before) and only ember 2 of Sleep rises. A steady pose: no breath,
 * still moment 2500.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import { embersOf }          from '../../sleep/Embers.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { BANK_FIRE_GESTURE } from './BankFireGesture.ts';

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => BANK_FIRE_GESTURE.targetPose(inputAt(elapsedMilliseconds));

describe('the entrance', () => {
  test('Flint lands and leans back; a square pats its top, 4 down at the middle of each pat', () => {
    const part = partAt(350);
    expect(part.body).toMatchObject({ hover: 0, leanDegrees: -5 });
    expect(part.nearHand).toEqual({
      cornerCount: 4, centreX: -4, centreY: -55, radius: 6.5, turnDegrees: 0, placement: 'exact-position',
    });
    expect(partAt(650).nearHand?.centreY).toBeCloseTo(-55, 9);
    expect(partAt(100).nearHand).toMatchObject({ centreY: -59, placement: 'eased' });
  });

  test('no tint before the first pat; cooled 0.3 and 0.97 high after it; 0.6 after the second', () => {
    expect(partAt(400).body?.tint).toBeUndefined();
    expect(partAt(400).body?.heightFactor).toBeUndefined();
    expect(partAt(500).body).toMatchObject({ tint: { role: 'emberDark', amount: 0.3 }, heightFactor: 0.97 });
    expect(partAt(800).body?.tint?.amount).toBeCloseTo(0.6, 9);
  });

  test('800 to 2000 the hand goes, the tint goes on to 0.7 and the eyes close to 2.5', () => {
    const part = partAt(1400);
    expect(part.nearHand).toBeNull();
    expect(part.body?.tint?.amount).toBeCloseTo(0.65, 9);
    expect(part.eyes?.height).toBeCloseTo(5.25, 9);
    expect(partAt(2000).eyes?.height).toBe(2.5);
  });
});

describe('the banked fire', () => {
  test('from 2000 the glow is 0.35 + 0.15 × sin(t / 900); it fades in from 1600, so it does not jump', () => {
    expect(partAt(2600).sleep?.glowOpacity).toBeCloseTo(0.35 + (0.15 * Math.sin(2600 / 900)), 9);
    expect(partAt(1800).sleep?.glowOpacity).toBeCloseTo(0.5 * (0.35 + (0.15 * Math.sin(1800 / 900))), 9);
    expect(partAt(1600).sleep?.glowOpacity).toBe(0);
  });

  test('only ember 2 of Sleep rises, from 2000', () => {
    expect(partAt(1999).props).toBeUndefined();
    const sleepEmber = embersOf(0, 1, 3000)[2];
    expect(partAt(2000 + 3000 - 2100).props?.bankedEmber?.shown).toBe(1);
    expect(partAt(2000 + 3000 - 2100).props?.bankedEmber?.ember).toEqual(sleepEmber);
    expect(partAt(2000).props?.bankedEmber?.ember.opacity).toBe(0);
  });

  test('the pose holds: tint 0.7, eyes 2.5, no breath, landed and leaned', () => {
    const part = partAt(9000);
    expect(part.body).toEqual({
      hover: 0, leanDegrees: -5, heightFactor: 0.97, tint: { role: 'emberDark', amount: 0.7 },
    });
    expect(part.eyes).toEqual({ height: 2.5 });
  });
});

test('a steady pose with its still moment at 2500; the part does not depend on the facing', () => {
  expect(BANK_FIRE_GESTURE.intents['bank-fire']).toEqual({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2500 });
  expect(BANK_FIRE_GESTURE.targetPose(inputAt(2500, -1))).toEqual(partAt(2500));
});
