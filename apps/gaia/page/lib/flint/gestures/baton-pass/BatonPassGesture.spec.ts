/**
 * Baton pass against `06-more-animations.md`, "Baton pass". What matters: it is one action of 2.6 seconds; the pentagon holds the baton
 * upright, the toss takes it to y -66 with a full turn and the hand away; the flicker sets the fill opacity at once at each of its four
 * moments and only the outline shows until 1300; the return is filled, bright and glowing, both fading to nothing at 1800, with a hop and
 * wide eyes; the baton falls back to the hand that shows again from 1350; the catch squashes the body for 120 ms; the happy eyes and glints
 * show to 2200; the baton and hand then fade; reduced motion holds 1700; the part does not depend on the facing.
 */
import { describe, expect, test } from 'bun:test';

import { poseWithPart }       from '../../PoseComposition.ts';
import { easedPoseOf }        from '../../PoseEasing.ts';
import type { Facing }        from '../../SpriteGeometry.ts';
import { NEUTRAL_POSE }       from '../../SpritePose.ts';
import type { GestureInput }  from '../GestureDefinition.ts';
import { BATON_PASS_GESTURE } from './BatonPassGesture.ts';

const FRAME_MILLISECONDS = 16;

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number, facing: Facing = 1) => BATON_PASS_GESTURE.targetPose(inputAt(elapsedMilliseconds, facing));

test('baton pass is one action of 2600 ms that reduced motion holds at 1700', () => {
  expect(BATON_PASS_GESTURE.intents['baton-pass']).toEqual({ variant: 'normal', durationMilliseconds: 2600, stillMomentMilliseconds: 1700 });
});

describe('the action', () => {
  test('0 to 300: one pentagon of radius 6 at (28, -26) holds the baton upright, its centre at (28, -34)', () => {
    const part = partAt(150);
    expect(part.nearHand).toEqual({
      cornerCount: 5, centreX: 28, centreY: -26, radius: 6, turnDegrees: 0, placement: 'eased',
    });
    expect(part.farHand).toBeNull();
    expect(part.props?.baton).toEqual({
      shown: 1, cycleOpacity: 1, centreX: 28, centreY: -34, turnDegrees: 0,
    });
  });

  test('300 to 700: the toss takes the baton up to y -66, slowing, with a full turn; the hand goes away', () => {
    expect(partAt(500).props?.baton).toMatchObject({ centreY: -58, turnDegrees: 180 });
    expect(partAt(500).nearHand).toBeNull();
    expect(partAt(700).props?.baton).toMatchObject({ centreY: -66, turnDegrees: 0 });
    expect(partAt(1000).props?.baton?.centreY).toBe(-66);
  });

  test('500 to 950: the flicker sets the fill opacity at once to 1, 0.2, 0.8 and 0; only the outline shows until 1300, eyes 1 high', () => {
    expect(partAt(450).body?.fillOpacity).toBeUndefined();
    expect(partAt(450).exactFields).toEqual([]);
    expect([500, 649, 650, 800, 950, 1299].map((moment) => partAt(moment).body?.fillOpacity)).toEqual([1, 1, 0.2, 0.8, 0, 0]);
    expect(partAt(650).exactFields).toEqual(['fill-opacity']);
    expect(partAt(1100).eyes?.height).toBe(1);
  });

  test('the fill opacity is drawn on the frame its step starts', () => {
    const drawn = easedPoseOf(NEUTRAL_POSE, poseWithPart(NEUTRAL_POSE, partAt(650)), FRAME_MILLISECONDS);
    expect(drawn.body.fillOpacity).toBe(0.2);
  });

  test('1300: filled at once, bright and glowing, fading in a straight line to 1800, with one hop of 5 and eyes 10 high', () => {
    const part = partAt(1300);
    expect(part.body).toMatchObject({ fillOpacity: 1, tint: { role: 'emberLight', amount: 0.8 } });
    expect(part.sleep).toEqual({ glowOpacity: 0.6 });
    expect(part.exactFields).toEqual(['fill-opacity', 'tint']);
    expect(partAt(1550).body?.tint?.amount).toBeCloseTo(0.4);
    expect(partAt(1550).sleep?.glowOpacity).toBeCloseTo(0.3);
    expect(partAt(1450).body?.addedLift).toBeCloseTo(5);
    expect(partAt(1400).eyes?.height).toBe(10);
    expect(partAt(1800).body?.tint?.amount).toBe(0);
    expect(partAt(1800).sleep).toBeUndefined();
  });

  test('1100 to 1500: the baton falls back with p²; the pentagon shows again from 1350', () => {
    expect(partAt(1300).props?.baton?.centreY).toBeCloseTo(-58);
    expect(partAt(1349).nearHand).toBeNull();
    expect(partAt(1350).nearHand).toMatchObject({ centreX: 28, centreY: -26 });
    expect(partAt(1500).props?.baton?.centreY).toBe(-34);
  });

  test('1500: the catch squashes the body to 1.05 by 0.95 for 120 ms', () => {
    expect(partAt(1560).body).toMatchObject({ widthFactor: 1.05, heightFactor: 0.95 });
    expect(partAt(1620).body?.widthFactor).toBeUndefined();
  });

  test('1500 to 2200: the happy eyes and the glints, which spring in on their width and leave in the last 160 ms', () => {
    expect(partAt(1900).eyes).toEqual({ happiness: 1 });
    expect(partAt(1500).emoteMark).toMatchObject({ name: 'happy-glints', innerScaleX: 0 });
    expect(partAt(1700).emoteMark).toMatchObject({ innerScaleX: 1, opacity: 1 });
    expect(partAt(2120).emoteMark?.opacity).toBeCloseTo(0.5);
    expect(partAt(2200).emoteMark).toBeUndefined();
  });

  test('2200 to 2600: the baton and the hand fade out', () => {
    expect(partAt(2400).nearHand).toBeNull();
    expect(partAt(2400).props?.baton?.cycleOpacity).toBeCloseTo(0.5);
  });
});

test('reduced motion holds the caught baton with the happy eyes and glints', () => {
  const part = partAt(BATON_PASS_GESTURE.intents['baton-pass'].stillMomentMilliseconds);
  expect(part.props?.baton?.centreY).toBe(-34);
  expect(part.eyes?.happiness).toBe(1);
  expect(part.emoteMark?.name).toBe('happy-glints');
});

test('facing left gives the same part', () => {
  for (const moment of [150, 500, 1300, 1900]) expect(partAt(moment, -1)).toEqual(partAt(moment, 1));
});
