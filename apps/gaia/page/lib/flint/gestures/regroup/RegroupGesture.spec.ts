/**
 * Regrouping: Flint points at each spark in turn without covering another, the live ones light and the dead one greys and is swept away,
 * then the live sparks bob. The part does not depend on the facing.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { REGROUP_GESTURE }   from './RegroupGesture.ts';

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number, facing: Facing = 1) => REGROUP_GESTURE.targetPose(inputAt(elapsedMilliseconds, facing));
const sparksAt = (elapsedMilliseconds: number) => partAt(elapsedMilliseconds).props?.regroupSparks?.sparks ?? [];

const PLACES = [[24, -46], [34, -50], [44, -44], [46, -32]] as const;

test('regroup is one loop that reduced motion holds at 2400', () => {
  expect(REGROUP_GESTURE.intents.regroup).toMatchObject({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2400 });
});

describe('the loop', () => {
  test('0 to 400: the four sparks fade in at their places, all dim, with no hand', () => {
    const part = partAt(200);
    expect(part.props?.regroupSparks?.cycleOpacity).toBeCloseTo(0.5);
    expect(sparksAt(200).map((spark) => [spark.centreX, spark.centreY])).toEqual(PLACES.map(([placeX, placeY]) => [placeX, placeY]));
    expect(sparksAt(200).map((spark) => [spark.dimOpacity, spark.liveOpacity, spark.deadOpacity])).toEqual([
      [0.35, 0, 0], [0.35, 0, 0], [0.35, 0, 0], [0.35, 0, 0],
    ]);
    expect(part.nearHand).toBeNull();
  });

  test('from 400 + 700n: the triangle points at spark n from 9 units short of it, its corner along the line from where it points from', () => {
    const POINTED_FROM = [[0, -24], [34, -24], [0, -24], [0, -24]] as const;
    PLACES.forEach(([placeX, placeY], i) => {
      const hand = partAt(400 + (700 * i) + 350).nearHand;
      const awayX = placeX - (POINTED_FROM[i]?.[0] ?? 0);
      const awayY = placeY - (POINTED_FROM[i]?.[1] ?? 0);
      const distance = Math.hypot(awayX, awayY);
      expect(hand).toMatchObject({ cornerCount: 3, radius: 6, placement: 'eased' });
      expect(hand?.centreX).toBeCloseTo(placeX - (9 * awayX / distance));
      expect(hand?.centreY).toBeCloseTo(placeY - (9 * awayY / distance));
      expect(hand?.turnDegrees).toBeCloseTo((Math.atan2(awayY, awayX) * 180 / Math.PI) + 90);
    });
  });

  test('no pointing hand covers another spark: each stays more than its radius and a spark\'s side clear of the others', () => {
    PLACES.forEach((_place, i) => {
      const hand = partAt(400 + (700 * i) + 350).nearHand;
      const others = PLACES.filter((_other, otherIndex) => otherIndex !== i);
      const nearest = Math.min(...others.map(([otherX, otherY]) => Math.hypot(otherX - (hand?.centreX ?? 0), otherY - (hand?.centreY ?? 0))));
      expect(nearest).toBeGreaterThan(6 + (4 / 2));
    });
  });

  test('the eyes look at the spark: eye shift 6, lift (spark y + 24) / 8 within -3 and 2; the dead spark narrows them to 5', () => {
    expect(partAt(750).eyes).toEqual({ shift: 6, lift: -2.75 });
    expect(partAt(1450).eyes).toEqual({ shift: 6, lift: -3 });
    expect(partAt(2150).eyes).toEqual({ shift: 6, lift: -2.5, height: 5 });
    expect(partAt(2850).eyes).toEqual({ shift: 6, lift: -1 });
  });

  test('a live spark lights up when pointed at, with the spring on its scale, and stays lit', () => {
    expect(sparksAt(399)[0]).toMatchObject({ liveOpacity: 0, dimOpacity: 0.35 });
    expect(sparksAt(500)[0]).toMatchObject({ liveOpacity: 1, dimOpacity: 0.175, liveScale: expect.closeTo(1.0, 0) });
    expect(sparksAt(600)[0]).toMatchObject({ liveOpacity: 1, dimOpacity: 0, liveScale: 1 });
    expect(sparksAt(3000)[1]).toMatchObject({ liveOpacity: 1, liveScale: 1 });
  });

  test('the dead spark goes grey at 15% and never lights', () => {
    expect(sparksAt(2000)[2]).toMatchObject({ deadOpacity: 0.15, dimOpacity: 0, liveOpacity: 0 });
  });

  test('3200 to 3900: a square of radius 6 sweeps from (40, -48) to (50, -38); the dead spark falls 14 and fades', () => {
    const part = partAt(3550);
    expect(part.nearHand).toEqual({
      cornerCount: 4, centreX: 45, centreY: -43, radius: 6, turnDegrees: 45, placement: 'eased',
    });
    expect(sparksAt(3550)[2]).toMatchObject({ centreY: -37, deadOpacity: expect.closeTo(0.075, 5) });
  });

  test('3900 to 4300: the hand goes away, the live sparks bob by 2 × sin(t / 300 + n) and Flint is happy', () => {
    const part = partAt(4100);
    expect(part.nearHand).toBeNull();
    expect(part.eyes).toEqual({ happiness: 1 });
    expect(sparksAt(4100)[3]?.centreY).toBeCloseTo(-32 + (2 * Math.sin((4100 / 300) + 3)));
    expect(sparksAt(4100)[2]?.deadOpacity).toBe(0);
  });

  test('4300 to 4600: the sparks fade out', () => {
    expect(partAt(4450).props?.regroupSparks?.cycleOpacity).toBeCloseTo(0.5);
    expect(partAt(4450).eyes).toBeUndefined();
  });

  test('the loop repeats every 4.6 seconds', () => {
    for (const moment of [200, 1450, 2400, 3550, 4100]) expect(partAt(4600 + moment)).toEqual(partAt(moment));
  });
});

test('reduced motion holds Flint looking at the dead spark with narrowed eyes', () => {
  const part = partAt(REGROUP_GESTURE.intents.regroup.stillMomentMilliseconds);
  expect(part.eyes?.height).toBe(5);
  expect(part.props?.regroupSparks?.sparks[2]?.deadOpacity).toBe(0.15);
});

test('facing left gives the same part', () => {
  for (const moment of [200, 1450, 3550]) expect(partAt(moment, -1)).toEqual(partAt(moment, 1));
});
