/**
 * Type against `02-animations.md`, "Type" and "Rules between animations". What matters: the two squares at their places with their
 * taps in each variant; the far hand taps opposite to the near hand in the normal and busy variants; the slam of the angry variant (raised for
 * 60% of 360 ms, a straight fall to 0 at 82%, the far hand half a cycle later) and its keyboard jolt; the busy eye shift 6, 8, 5;
 * the angry vein, which an emote's mark hides; and a pointing triangle that shrinks away before the typing square appears.
 */
import { describe, expect, test } from 'bun:test';

import { composedTargetPose }            from '../../PoseComposition.ts';
import { easedPoseOf }                   from '../../PoseEasing.ts';
import type { Pose }                     from '../../SpritePose.ts';
import { NEUTRAL_POSE, emoteMarkAtRest } from '../../SpritePose.ts';
import type { GestureInput }             from '../GestureDefinition.ts';
import type { WorkingVariant }           from '../WorkingVariantPart.ts';
import { POINT_GESTURE }                 from '../point/PointGesture.ts';
import { TYPE_GESTURE }                  from './TypeGesture.ts';

const FRAME_MILLISECONDS = 16;

function inputAt(elapsedMilliseconds: number, variant: WorkingVariant): GestureInput<WorkingVariant> {
  return {
    elapsedMilliseconds, variant, facing: 1, sidewaysWidth: 1, target: null, verdict: null,
  };
}

function tapsAt(elapsedMilliseconds: number, variant: WorkingVariant): { readonly near: number; readonly far: number } {
  const part = TYPE_GESTURE.targetPose(inputAt(elapsedMilliseconds, variant));
  return { near: (part.nearHand?.centreY ?? Number.NaN) + 10, far: (part.farHand?.centreY ?? Number.NaN) + 13 };
}

describe('the hands and the keyboard', () => {
  test('two squares turned 45 degrees: the near hand of radius 6.4 at x 22, the far hand of radius 5.8 at x 30', () => {
    for (const { variant } of Object.values(TYPE_GESTURE.intents)) {
      const part = TYPE_GESTURE.targetPose(inputAt(500, variant));
      expect(part.nearHand).toMatchObject({
        cornerCount: 4, centreX: 22, radius: 6.4, turnDegrees: 45, placement: 'eased',
      });
      expect(part.farHand).toMatchObject({
        cornerCount: 4, centreX: 30, radius: 5.8, turnDegrees: 45, placement: 'eased',
      });
      expect(part.props?.keyboard?.shown).toBe(1);
    }
  });
});

describe('the normal variant', () => {
  test('the near hand taps by -4 × (0.5 + 0.5 × sin(t / 64)) from y -10', () => {
    for (const elapsedMilliseconds of [0, 50, 101, 777]) {
      expect(tapsAt(elapsedMilliseconds, 'normal').near).toBeCloseTo(-4 * (0.5 + (0.5 * Math.sin(elapsedMilliseconds / 64))));
    }
  });

  test('the far hand taps opposite: the two taps always add up to the full depth of 4', () => {
    for (let elapsedMilliseconds = 0; elapsedMilliseconds < 800; elapsedMilliseconds += 37) {
      const taps = tapsAt(elapsedMilliseconds, 'normal');
      expect(taps.near + taps.far).toBeCloseTo(-4);
    }
  });

  test('the eyes are 6 high, shifted 6, and look down at the keys with a lift of 2; the body leans 5; the keyboard stays still', () => {
    const part = TYPE_GESTURE.targetPose(inputAt(500, 'normal'));
    expect(part.eyes).toEqual({ shift: 6, height: 6, lift: 2 });
    expect(part.body).toEqual({ leanDegrees: 5 });
    expect(part.props?.keyboard?.drop).toBe(0);
    expect(part.emoteMark).toBeUndefined();
  });
});

describe('the busy variant', () => {
  test('the near hand taps by -3 × (0.5 + 0.5 × sin(t / 26)) and the far hand opposite', () => {
    for (const elapsedMilliseconds of [0, 13, 40, 333]) {
      const taps = tapsAt(elapsedMilliseconds, 'busy');
      expect(taps.near).toBeCloseTo(-3 * (0.5 + (0.5 * Math.sin(elapsedMilliseconds / 26))));
      expect(taps.near + taps.far).toBeCloseTo(-3);
    }
  });

  test('the eye shift is 6, 8, 5 in turn, a new value each 300 ms', () => {
    const shiftAt = (elapsedMilliseconds: number): number | undefined => TYPE_GESTURE.targetPose(inputAt(elapsedMilliseconds, 'busy')).eyes?.shift;
    expect([shiftAt(0), shiftAt(299), shiftAt(300), shiftAt(600), shiftAt(900)]).toEqual([6, 6, 8, 5, 6]);
  });

  test('the body leans 9 and bobs by 0.8 × sin(t / 50); the eyes are 4 high with a lift of 3', () => {
    const part = TYPE_GESTURE.targetPose(inputAt(70, 'busy'));
    expect(part.body?.leanDegrees).toBe(9);
    expect(part.body?.addedLift).toBeCloseTo(0.8 * Math.sin(70 / 50));
    expect(part.eyes?.height).toBe(4);
    expect(part.eyes?.lift).toBe(3);
  });
});

describe('the angry variant', () => {
  test('the slam: the hand is at -9 for the first 60% of 360 ms, falls in a straight line to 0 at 82%, and stays at 0', () => {
    expect(tapsAt(0, 'angry').near).toBeCloseTo(-9);
    expect(tapsAt(215, 'angry').near).toBeCloseTo(-9);
    expect(tapsAt(360 * 0.71, 'angry').near).toBeCloseTo(-4.5);
    expect(tapsAt(360 * 0.82, 'angry').near).toBeCloseTo(0);
    expect(tapsAt(359, 'angry').near).toBe(0);
    expect(tapsAt(360, 'angry').near).toBeCloseTo(-9);
  });

  test('the far hand slams half a cycle later than the near hand', () => {
    for (let elapsedMilliseconds = 0; elapsedMilliseconds < 720; elapsedMilliseconds += 23) {
      expect(tapsAt(elapsedMilliseconds, 'angry').far).toBeCloseTo(tapsAt(elapsedMilliseconds + 180, 'angry').near);
    }
  });

  test('the keyboard moves down 1.6 units in the last 18% of each 180 ms', () => {
    const dropAt = (elapsedMilliseconds: number): number | undefined => TYPE_GESTURE.targetPose(inputAt(elapsedMilliseconds, 'angry')).props?.keyboard?.drop;
    expect(dropAt(140)).toBe(0);
    expect(dropAt(150)).toBe(1.6);
    expect(dropAt(179)).toBe(1.6);
    expect(dropAt(181)).toBe(0);
  });

  test('the body leans 7 and shakes; the eyes are 7 high, slanted 20, with a lift of 2; the vein shows', () => {
    const part = TYPE_GESTURE.targetPose(inputAt(30, 'angry'));
    expect(part.body?.leanDegrees).toBe(7);
    expect(part.body?.addedShake).toBeCloseTo(0.8 * Math.sin(30 / 28));
    expect(part.eyes).toEqual({
      shift: 6, height: 7, slantDegrees: 20, lift: 2
    });
    expect(part.emoteMark?.name).toBe('anger-vein');
  });

  test('an emote has priority: its mark hides the vein of the angry variant', () => {
    const surprised = emoteMarkAtRest('exclamation');
    const pose = composedTargetPose({
      base:          NEUTRAL_POSE,
      gesture:       () => TYPE_GESTURE.targetPose(inputAt(30, 'angry')),
      emote:         () => ({ emoteMark: surprised }),
      sleep:         () => null,
      attendants:    [],
      reducedMotion: false,
    });
    expect(pose.emoteMark).toEqual(surprised);
  });
});

describe('the change from pointing to typing', () => {
  test('the pointing triangle shrinks away first, and the typing square then grows from the body at (10, -22)', () => {
    const pointing: Pose = composedTargetPose({
      base:          NEUTRAL_POSE,
      gesture:       () => POINT_GESTURE.targetPose({ ...inputAt(0, 'normal'), variant: 'normal' }),
      emote:         () => null,
      sleep:         () => null,
      attendants:    [],
      reducedMotion: false,
    });
    const typing: Pose = composedTargetPose({
      base: NEUTRAL_POSE, gesture: () => TYPE_GESTURE.targetPose(inputAt(0, 'normal')), emote: () => null, sleep: () => null, attendants: [], reducedMotion: false,
    });
    let drawn = pointing;
    let triangleRadius = pointing.nearHand?.radius ?? 0;
    while (drawn.nearHand?.cornerCount === 3) {
      triangleRadius = drawn.nearHand.radius;
      drawn = easedPoseOf(drawn, typing, FRAME_MILLISECONDS);
    }
    expect(triangleRadius).toBeLessThanOrEqual(0.6);
    expect(drawn.nearHand?.cornerCount).toBe(4);
    expect(drawn.nearHand?.radius).toBeLessThan(6.4 / 2);
    expect(drawn.nearHand?.centreX).toBeGreaterThan(10);
    expect(drawn.nearHand?.centreX).toBeLessThan(22);
    expect(drawn.nearHand?.centreY).toBeLessThan(-12);
  });
});
