/**
 * Customs. What matters: claim n starts at 400 + 1300n; in a claim the pentagon reaches into the crate at
 * the hand rate, then its path is set exactly so the item moves with it, up to (39, -30) and back; Flint looks down at the crate and up at
 * the list, and the claim gets its tick at 800. The third claim is found in one cycle and not found in the next: the hand comes up empty
 * and turns, the claim gets a cross, and the eyes narrow and slant. The verdict at 4300 is the happy eyes, or eye height 4 and lean 9;
 * the props fade in and out in each cycle. Reduced motion holds 1200. The list's reading direction is the prop's, so the part is the same
 * either facing.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { CUSTOMS_GESTURE }   from './CustomsGesture.ts';

const CYCLE_MILLISECONDS = 5200;

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => CUSTOMS_GESTURE.targetPose(inputAt(elapsedMilliseconds));

describe('a claim', () => {
  test('before the first claim there is no hand, and the props fade in over 300 ms', () => {
    expect(partAt(200).nearHand).toBeNull();
    expect(partAt(150).props?.customsList?.cycleOpacity).toBeCloseTo(0.5);
    expect(partAt(150).props?.customsCrate?.cycleOpacity).toBeCloseTo(0.5);
  });

  test('0 to 350: one pentagon of 5.5 goes into the crate, to (39, -18), at the hand rate; eye lift 3', () => {
    const part = partAt(400 + 200);
    expect(part.nearHand).toEqual({
      cornerCount: 5, centreX: 39, centreY: -18, radius: 5.5, turnDegrees: 0, placement: 'eased',
    });
    expect(part.eyes).toEqual({ shift: 6, height: 6, lift: 3 });
    expect(part.props?.customsCrate?.itemOpacity).toBe(0);
  });

  test('350 to 700: the hand lifts the item to (39, -30), set exactly, and the item moves with it', () => {
    const part = partAt(400 + 525);
    expect(part.nearHand).toMatchObject({ centreX: 39, centreY: -24, placement: 'exact-position' });
    expect(part.props?.customsCrate).toMatchObject({ itemCentreX: 39, itemCentreY: -24, itemOpacity: 1 });
  });

  test('700 to 900: Flint looks at the list, and at 800 the claim gets its tick', () => {
    expect(partAt(400 + 750).eyes?.lift).toBe(-3);
    expect(partAt(400 + 799).props?.customsList?.verdicts).toEqual(['unchecked', 'unchecked', 'unchecked']);
    expect(partAt(400 + 800).props?.customsList?.verdicts).toEqual(['found', 'unchecked', 'unchecked']);
    expect(partAt(400 + 800).nearHand?.centreY).toBe(-30);
  });

  test('900 to 1200: the hand puts the item back into the crate', () => {
    expect(partAt(400 + 1050).nearHand?.centreY).toBe(-24);
    expect(partAt(400 + 1050).eyes?.lift).toBe(3);
    expect(partAt(400 + 1250).props?.customsCrate?.itemOpacity).toBe(0);
  });

  test('claim n starts at 400 + 1300n, and the hand goes away after the third', () => {
    expect(partAt(1700 + 525).nearHand?.centreY).toBe(-24);
    expect(partAt(3000 + 800).props?.customsList?.verdicts).toEqual(['found', 'found', 'found']);
    expect(partAt(4250).nearHand).toBeNull();
  });
});

describe('the third claim, in turn', () => {
  test('in the first cycle it is found, and the verdict is the happy eyes', () => {
    expect(partAt(3000 + 525).props?.customsCrate?.itemOpacity).toBe(1);
    expect(partAt(4500).eyes?.happiness).toBe(1);
    expect(partAt(4500).body).toEqual({ leanDegrees: 5 });
  });

  test('in the next cycle the hand comes up empty and turns by 15 × sin(4πp); eye height 5, slant 12', () => {
    const part = partAt(CYCLE_MILLISECONDS + 3000 + 350 + 44);
    expect(part.props?.customsCrate?.itemOpacity).toBe(0);
    expect(part.nearHand?.turnDegrees).toBeCloseTo(15 * Math.sin(4 * Math.PI * (44 / 350)));
    expect(part.eyes).toMatchObject({ height: 5, slantDegrees: 12 });
    expect(partAt(CYCLE_MILLISECONDS + 3000 + 750).nearHand?.turnDegrees).toBe(0);
  });

  test('then it gets a small cross, and the verdict is eye height 4 and lean 9', () => {
    expect(partAt(CYCLE_MILLISECONDS + 3000 + 800).props?.customsList?.verdicts).toEqual(['found', 'found', 'not-found']);
    const verdict = partAt(CYCLE_MILLISECONDS + 4500);
    expect(verdict.eyes).toEqual({ shift: 6, height: 4 });
    expect(verdict.body).toEqual({ leanDegrees: 9 });
  });

  test('the cycle after that finds it again', () => {
    expect(partAt((2 * CYCLE_MILLISECONDS) + 3000 + 800).props?.customsList?.verdicts).toEqual(['found', 'found', 'found']);
  });
});

test('from 4700 the props fade out, and the verdict ends', () => {
  expect(partAt(4950).props?.customsList?.cycleOpacity).toBeCloseTo(0.5);
  expect(partAt(4950).eyes?.happiness).toBeUndefined();
});

test('reduced motion holds 1200: the item lifted, the eyes on the list and the first tick', () => {
  const still = partAt(CUSTOMS_GESTURE.intents.customs.stillMomentMilliseconds);
  expect(CUSTOMS_GESTURE.intents.customs).toEqual({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 1200 });
  expect(still.nearHand?.centreY).toBe(-30);
  expect(still.props?.customsCrate?.itemOpacity).toBe(1);
  expect(still.eyes?.lift).toBe(-3);
  expect(still.props?.customsList?.verdicts[0]).toBe('found');
});

test('facing left gives the same part: the list turns its reading direction itself', () => {
  for (const moment of [600, 925, 1200, 3394, CYCLE_MILLISECONDS + 3394, CYCLE_MILLISECONDS + 4500]) {
    expect(CUSTOMS_GESTURE.targetPose(inputAt(moment, -1))).toEqual(partAt(moment));
  }
});
