/**
 * Gate failed, one action: Flint types while the note falls, flinches crimson when it lands, draws back its hands, looks at the note, sighs
 * and types on as the note fades.
 */
import { describe, expect, test } from 'bun:test';

import type { GestureInput }   from '../GestureDefinition.ts';
import { TYPE_GESTURE }        from '../type/TypeGesture.ts';
import { GATE_FAILED_GESTURE } from './GateFailedGesture.ts';

function inputAt(elapsedMilliseconds: number): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing: 1, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => GATE_FAILED_GESTURE.targetPose(inputAt(elapsedMilliseconds));

describe('the fall of the note', () => {
  test('until the note lands, Flint types in the normal variant of Type', () => {
    const typing = TYPE_GESTURE.targetPose(inputAt(200));
    const part = partAt(200);
    expect([part.nearHand, part.farHand, part.body, part.eyes]).toEqual([typing.nearHand, typing.farHand, typing.body, typing.eyes]);
    expect(part.props?.keyboard).toEqual({ shown: 1, drop: 0 });
  });

  test('the note falls with p² from y -70 to y -18 at x 30', () => {
    expect(partAt(0).props?.gateNote).toEqual({ shown: 1, topY: -70, opacity: 1 });
    expect(partAt(175).props?.gateNote?.topY).toBeCloseTo(-70 + (52 * 0.25));
  });
});

describe('the landing at 350', () => {
  test('the keyboard and the note on it are 1.6 lower for 100 ms', () => {
    expect([partAt(350).props?.keyboard?.drop, partAt(350).props?.gateNote?.topY]).toEqual([1.6, -16.4]);
    expect([partAt(450).props?.keyboard?.drop, partAt(450).props?.gateNote?.topY]).toEqual([0, -18]);
  });

  test('the eye height 10 and the full crimson tint are set at once', () => {
    const part = partAt(350);
    expect(part.eyes?.height).toBe(10);
    expect(part.body?.tint).toEqual({ role: 'alarm', amount: 1 });
    expect(part.exactFields).toEqual(['eye-height', 'tint']);
  });

  test('one flinch lifts the body by 4 × sin(π × p) until 600', () => {
    expect(partAt(475).body?.addedLift).toBeCloseTo(4);
    expect(partAt(400).body?.addedLift).toBeCloseTo(4 * Math.sin(Math.PI * 0.2));
    expect(partAt(650).body?.addedLift).toBe(0);
  });

  test('until 900 the lean is -4, the tint fades in a straight line, and the hands are drawn back with radius 4.5', () => {
    const part = partAt(750);
    expect(part.body?.leanDegrees).toBe(-4);
    expect(part.body?.tint?.amount).toBeCloseTo(1 - (400 / 550));
    expect(part.exactFields).toEqual(['tint']);
    expect(part.nearHand).toMatchObject({
      cornerCount: 4, centreX: 16, centreY: -16, radius: 4.5
    });
    expect(part.farHand).toMatchObject({
      cornerCount: 4, centreX: 20, centreY: -19, radius: 4.5
    });
  });
});

describe('after the flinch', () => {
  test('from 700 Flint looks down at the note: eye height 4, lift 2; the tint is gone after 900', () => {
    expect(partAt(800).eyes).toMatchObject({ height: 4, lift: 2 });
    expect(partAt(1000).body?.tint).toBeUndefined();
    expect(partAt(1000).exactFields).toEqual([]);
  });

  test('after the recoil Flint stands upright, clear of its drawn-back hands, and leans to work again once they are on the keys', () => {
    expect([partAt(1000).body?.leanDegrees, partAt(2000).body?.leanDegrees, partAt(2250).body?.leanDegrees]).toEqual([0, 0, 5]);
  });

  test('the sigh from 1500 to 2100: width × 1.03, height × 0.96, eye height 3', () => {
    const part = partAt(1800);
    expect(part.body).toMatchObject({ widthFactor: 1.03, heightFactor: 0.96 });
    expect(part.eyes?.height).toBe(3);
    expect(partAt(2200).body?.widthFactor).toBeUndefined();
  });

  test('from 2100 the hands go back to the typing places and the note fades out', () => {
    const part = partAt(2250);
    expect(part.nearHand).toMatchObject({ centreX: 22, centreY: -10, radius: 6.4 });
    expect(part.farHand).toMatchObject({ centreX: 30, centreY: -13, radius: 5.8 });
    expect(part.props?.gateNote?.opacity).toBeCloseTo(0.5);
  });
});

test('it is one action of 2400 ms, and reduced motion holds Flint looking down at the landed note', () => {
  const form = GATE_FAILED_GESTURE.intents['gate-failed'];
  expect([form.variant, form.durationMilliseconds, form.stillMomentMilliseconds]).toEqual(['normal', 2400, 1000]);
  const still = partAt(form.stillMomentMilliseconds);
  expect(still.props?.gateNote?.topY).toBe(-18);
  expect(still.eyes).toMatchObject({ height: 4, lift: 2 });
});
