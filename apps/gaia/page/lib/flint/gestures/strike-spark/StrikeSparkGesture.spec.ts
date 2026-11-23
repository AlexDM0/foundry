/**
 * Strike a spark. What matters: the square rises, then strikes along the edge of the body with its place
 * set exactly; at 330 the five small sparks fly on their fan of angles, the body squashes for 120 ms and the inner glow falls from 0.6 to 0
 * at 700; the Watcher flies an arc that rises past its place, the eyes follow it (at the working shift while the struck square is there, so
 * the right eye never runs under it), then it floats, the hand goes, the happy eyes show and it fades in the last 200 ms. It is one action
 * of 1500 ms that reduced motion holds at 900, and the part is the same either facing, since nothing in it is read or written.
 */
import { describe, expect, test } from 'bun:test';

import { poseWithPart }         from '../../PoseComposition.ts';
import { easedPoseOf }          from '../../PoseEasing.ts';
import type { Facing }          from '../../SpriteGeometry.ts';
import { NEUTRAL_POSE }         from '../../SpritePose.ts';
import type { GestureInput }    from '../GestureDefinition.ts';
import { STRIKE_SPARK_GESTURE } from './StrikeSparkGesture.ts';

const FRAME_MILLISECONDS = 16;

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => STRIKE_SPARK_GESTURE.targetPose(inputAt(elapsedMilliseconds));

describe('the strike', () => {
  test('0 to 250: one square of 6.5, turned 45, rises from (26, -44) to (30, -50); eye height 5', () => {
    const part = partAt(125);
    expect(part.nearHand).toEqual({
      cornerCount: 4, centreX: 28, centreY: -47, radius: 6.5, turnDegrees: 45, placement: 'eased',
    });
    expect(part.farHand).toBeNull();
    expect(part.eyes?.height).toBe(5);
    expect(part.body?.leanDegrees).toBe(5);
  });

  test('250 to 330: the strike runs in a straight line to (18, -18) along the body, set exactly', () => {
    expect(partAt(290).nearHand).toMatchObject({ centreX: 24, centreY: -34, placement: 'exact-position' });
    expect(partAt(330).nearHand).toMatchObject({ centreX: 18, centreY: -18, placement: 'exact-position' });
    const drawn = easedPoseOf(NEUTRAL_POSE, poseWithPart(NEUTRAL_POSE, partAt(290)), FRAME_MILLISECONDS);
    expect([drawn.nearHand?.centreX, drawn.nearHand?.centreY]).toEqual([24, -34]);
  });

  test('from 800 the hand goes away', () => {
    expect(partAt(799).nearHand).not.toBeNull();
    expect(partAt(800).nearHand).toBeNull();
  });
});

describe('at 330', () => {
  test('five small sparks fly 16 in 400 ms, at -50 + 20n degrees, turning 180 and fading', () => {
    const justStruck = partAt(331).props?.struckSparks?.smallSparks ?? [];
    expect(justStruck.map((spark) => [Math.round(spark.x), Math.round(spark.y), spark.opacity > 0.99])).toEqual(Array.from({ length: 5 }, () => [20, -24, true]));
    const halfway = partAt(530).props?.struckSparks?.smallSparks ?? [];
    expect(halfway).toHaveLength(5);
    halfway.forEach((spark, i) => {
      const angle = ((-50 + (20 * i)) * Math.PI) / 180;
      expect(spark.x).toBeCloseTo(20 + (8 * Math.cos(angle)));
      expect(spark.y).toBeCloseTo(-24 + (8 * Math.sin(angle)));
      expect(spark.turnDegrees).toBeCloseTo(90);
      expect(spark.opacity).toBeCloseTo(0.5);
    });
    expect(halfway[0]?.y).toBeLessThan(-24);
    expect(halfway[4]?.y).toBeGreaterThan(-24);
  });

  test('the small sparks are not seen before the strike or after their flight', () => {
    for (const moment of [100, 329, 730, 1000]) {
      expect(partAt(moment).props?.struckSparks?.smallSparks.every((spark) => spark.opacity === 0)).toBe(true);
    }
  });

  test('the body is 0.96 wide and 1.03 high for 120 ms', () => {
    expect(partAt(400).body).toEqual({ leanDegrees: 5, widthFactor: 0.96, heightFactor: 1.03 });
    expect(partAt(450).body).toEqual({ leanDegrees: 5 });
    expect(partAt(329).body).toEqual({ leanDegrees: 5 });
  });

  test('the inner glow is 0.6 and falls to 0 at 700, given on every frame', () => {
    expect(partAt(200).sleep).toEqual({ glowOpacity: 0 });
    expect(partAt(330).sleep?.glowOpacity).toBeCloseTo(0.6);
    expect(partAt(515).sleep?.glowOpacity).toBeCloseTo(0.3);
    expect(partAt(700).sleep).toEqual({ glowOpacity: 0 });
  });

  test('eye height 10', () => {
    expect(partAt(330).eyes?.height).toBe(10);
  });
});

describe('the Watcher', () => {
  test('330 to 800: it springs in at (20, -24) and flies an arc to (40, -40) that rises past its place; the eyes follow it', () => {
    expect(partAt(330).props?.struckSparks).toMatchObject({ watcherX: 20, watcherY: -24, watcherScale: 0 });
    expect(partAt(530).props?.struckSparks?.watcherScale).toBe(1);
    const arrived = partAt(800).props?.struckSparks;
    expect(arrived?.watcherX).toBeCloseTo(40);
    expect(arrived?.watcherY).toBeCloseTo(-40);
    expect(partAt(660).props?.struckSparks?.watcherY).toBeLessThan(-40);
    expect(partAt(600).eyes).toEqual({ lift: -3, shift: 6, height: 10 });
    expect(partAt(850).eyes).toEqual({ lift: -3, shift: 7, height: 10 });
  });

  test('800 to 1500: it floats by 2 × sin, the happy eyes show from 900, and it fades out in the last 200 ms', () => {
    const floatAt = (moment: number) => partAt(moment).props?.struckSparks?.watcherY;
    expect(floatAt(800 + (150 * Math.PI))).toBeCloseTo(-38);
    expect(partAt(899).eyes?.happiness).toBeUndefined();
    expect(partAt(900).eyes?.happiness).toBe(1);
    expect(partAt(1200).props?.struckSparks?.watcherOpacity).toBe(1);
    expect(partAt(1400).props?.struckSparks?.watcherOpacity).toBeCloseTo(0.5);
    expect(partAt(1500).props?.struckSparks?.watcherOpacity).toBe(0);
  });

  test('it is not seen before the strike', () => {
    expect(partAt(200).props?.struckSparks?.watcherOpacity).toBe(0);
  });
});

test('one action of 1500 ms; reduced motion holds 900: the Watcher in place, the hand gone, the happy eyes', () => {
  expect(STRIKE_SPARK_GESTURE.intents['strike-spark']).toEqual({ variant: 'normal', durationMilliseconds: 1500, stillMomentMilliseconds: 900 });
  const still = partAt(STRIKE_SPARK_GESTURE.intents['strike-spark'].stillMomentMilliseconds);
  expect(still.nearHand).toBeNull();
  expect(still.eyes?.happiness).toBe(1);
  expect(still.props?.struckSparks).toMatchObject({ watcherX: 40, watcherScale: 1, watcherOpacity: 1 });
  expect(still.props?.struckSparks?.watcherY).toBeCloseTo(-40 + (2 * Math.sin(100 / 300)));
});

test('facing left gives the same part: the renderer mirrors the pose, and nothing in it is read or written', () => {
  for (const moment of [125, 290, 530, 900, 1400]) {
    expect(STRIKE_SPARK_GESTURE.targetPose(inputAt(moment, -1))).toEqual(partAt(moment));
  }
});
