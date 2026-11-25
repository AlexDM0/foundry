/**
 * Out of fuel and Refuel. What matters: out-of-fuel is a steady pose (cooled at the rate
 * of falling asleep, landed, leaned back, no glow) with a crimson level that blinks every 350 ms, a slow blink each 3 s and a look at the
 * user each 5 s, and its still moment at 3000 shows neither; refuel is one action of 1600 ms that fills the gauge in 700 ms, turns the
 * level green when full, lets the tint go at the body rate, flares at 700 (glow, hop, swell, sparks), and is happy from 900. Neither
 * depends on the facing: the gauge mirrors with the pose and nothing is written or read.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }         from '../../SpriteGeometry.ts';
import type { GestureInput }   from '../GestureDefinition.ts';
import { OUT_OF_FUEL_GESTURE } from './OutOfFuelGesture.ts';

type Variant = 'normal' | 'refuel';

function inputAt(elapsedMilliseconds: number, variant: Variant, facing: Facing = 1): GestureInput<Variant> {
  return {
    elapsedMilliseconds, variant, facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number, variant: Variant) => OUT_OF_FUEL_GESTURE.targetPose(inputAt(elapsedMilliseconds, variant));

describe('out of fuel', () => {
  test('the still moment at 3000: cooled at 0.85 at the falling-asleep rate, landed, leaned back, no glow, looking at the gauge', () => {
    const part = partAt(3000, 'normal');
    expect(part.body).toMatchObject({ tint: { role: 'emberDark', amount: 0.85, ratePerSecond: 2.2 }, hover: 0, leanDegrees: -4, });
    expect(part.body?.heightFactor).toBeCloseTo(1 - (0.02 * Math.sin(3000 / 900)), 9);
    expect(part.eyes).toEqual({ height: 4, lift: 1, shift: 5 });
    expect(part.sleep).toEqual({ glowOpacity: 0 });
    expect([part.nearHand, part.farHand]).toEqual([null, null]);
  });

  test('the gauge at (32, -40) holds a level of 0.12 in crimson, readable at half size, bright for 350 ms, then dim for 350 ms', () => {
    expect(partAt(100, 'normal').props?.fuelGauge).toEqual({
      shown: 1, level: 0.12, levelColour: 'alarm', levelOpacity: 1, fade: 1,
    });
    expect(partAt(500, 'normal').props?.fuelGauge?.levelOpacity).toBe(0.4);
    expect(partAt(800, 'normal').props?.fuelGauge?.levelOpacity).toBe(1);
  });

  test('a slow blink of 400 ms closes the eyes in the middle of the last 400 ms of each 3 s', () => {
    expect(partAt(2800, 'normal').eyes?.height).toBeCloseTo(1, 9);
    expect(partAt(5800, 'normal').eyes?.height).toBeCloseTo(1, 9);
    expect(partAt(2500, 'normal').eyes?.height).toBe(4);
  });

  test('each 5 s Flint looks at the user for 600 ms: eye shift 1, height 5', () => {
    expect(partAt(4500, 'normal').eyes).toMatchObject({ height: 5, shift: 1 });
    expect(partAt(4300, 'normal').eyes?.shift).toBe(5);
  });

  test('a steady pose: it runs until something stops it', () => {
    expect(OUT_OF_FUEL_GESTURE.intents['out-of-fuel']).toMatchObject({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 3000 });
  });
});

describe('refuel', () => {
  test('0 to 700: the level fills from 0.12 to 1 in the body colour, green once full; the tint goes at the body rate', () => {
    const halfway = partAt(350, 'refuel');
    expect(halfway.props?.fuelGauge).toMatchObject({ level: 0.56, levelColour: 'body' });
    expect(halfway.body).toMatchObject({ tint: { amount: 0, ratePerSecond: 7 }, hover: 0, leanDegrees: -4 });
    expect(partAt(700, 'refuel').props?.fuelGauge).toMatchObject({ level: 1, levelColour: 'done' });
  });

  test('700: the flare; the glow is 0.7 and out by 1300, the hover comes back with a hop of 6, the body swells for 150 ms', () => {
    const flare = partAt(700, 'refuel');
    expect(flare.sleep?.glowOpacity).toBeCloseTo(0.7, 9);
    expect(flare.body).toMatchObject({ widthFactor: 1.06, heightFactor: 1.06 });
    expect(flare.body?.hover).toBeUndefined();
    expect(flare.eyes).toEqual({ height: 10 });
    expect(partAt(850, 'refuel').body?.addedLift).toBeCloseTo(6, 9);
    expect(partAt(1000, 'refuel').sleep?.glowOpacity).toBeCloseTo(0.35, 9);
    expect(partAt(1300, 'refuel').sleep?.glowOpacity).toBe(0);
    expect(partAt(900, 'refuel').body?.widthFactor).toBeUndefined();
  });

  test('four small sparks fly from the body centre on the ways of Merge with 1.5 times the travel', () => {
    const sparks = partAt(925, 'refuel').props?.refuelSparks?.sparks ?? [];
    expect(sparks.map((spark) => [spark.x, spark.y])).toEqual([
      [-17.5, -29.5],
      [17.5, -29.5],
      [-17.5, -17.4],
      [17.5, -17.4],
    ]);
    expect(sparks[0]?.opacity).toBeCloseTo(0.5, 9);
    expect(partAt(600, 'refuel').props?.refuelSparks?.sparks.every((spark) => spark.opacity === 0)).toBe(true);
  });

  test('happy from 900; the gauge fades out from 1100', () => {
    expect(partAt(900, 'refuel').eyes).toEqual({ happiness: 1 });
    expect(partAt(1350, 'refuel').props?.fuelGauge?.fade).toBeCloseTo(0.5, 9);
  });

  test('one action of 1600 ms; reduced motion holds 900; the part does not depend on the facing', () => {
    expect(OUT_OF_FUEL_GESTURE.intents.refuel).toMatchObject({ variant: 'refuel', durationMilliseconds: 1600, stillMomentMilliseconds: 900 });
    expect(OUT_OF_FUEL_GESTURE.targetPose(inputAt(900, 'refuel', -1))).toEqual(partAt(900, 'refuel'));
  });
});
