/**
 * Crash resume against `06-more-animations.md`, "Crash resume". What matters: the eyes are 10 at once until 120; the fill opacity is 1,
 * 0.3, 0.9 and 0, each set at once at 120, 220, 320 and 420; from 420 the eyes are 1 at once, Flint lands and leans -7; the spark at
 * the centre shows from 600 and pulses by 0.3 × sin(t / 80); from 1300 the fill comes back in a straight line by 1600, the bright tint 0.6
 * goes out by 2000, the spark fades out by 1600, and the hover returns; 1700 to 2200 a dying head shake with two blinks; then the eyes look
 * behind (-3) and ahead (6). The still moment, 900, is the outline with the spark. The part does not depend on the facing.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }          from '../../SpriteGeometry.ts';
import type { GestureInput }    from '../GestureDefinition.ts';
import { CRASH_RESUME_GESTURE } from './CrashResumeGesture.ts';

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => CRASH_RESUME_GESTURE.targetPose(inputAt(elapsedMilliseconds));

describe('the crash', () => {
  test('0 to 120: the eyes are 10, set at once; the body is whole', () => {
    const part = partAt(60);
    expect(part.eyes).toEqual({ height: 10 });
    expect(part.exactFields).toEqual(['eye-height']);
    expect(part.body?.fillOpacity).toBeUndefined();
  });

  test.each([
    [120, 1],
    [219, 1],
    [220, 0.3],
    [320, 0.9],
    [420, 0],
    [1000, 0],
  ])('at %i ms the fill opacity is %d, set at once', (elapsedMilliseconds, fillOpacity) => {
    const part = partAt(elapsedMilliseconds);
    expect(part.body?.fillOpacity).toBe(fillOpacity);
    expect(part.exactFields).toContain('fill-opacity');
  });

  test('420 to 1300: the eyes are shut at once, Flint lands and leans back', () => {
    const part = partAt(500);
    expect(part.eyes).toEqual({ height: 1 });
    expect(part.exactFields).toContain('eye-height');
    expect(part.body).toMatchObject({ hover: 0, leanDegrees: -7 });
  });

  test('600 to 1300: one spark at the centre pulses by 0.3 × sin(t / 80); none before', () => {
    expect(partAt(599).props).toBeUndefined();
    expect(partAt(900).props?.crashSpark).toEqual({ shown: 1, scale: 1 + (0.3 * Math.sin(900 / 80)), fade: 1 });
  });
});

describe('the resume', () => {
  test('1300 to 1600: the fill comes back in a straight line and the spark fades out; the hover and lean come back', () => {
    const part = partAt(1450);
    expect(part.body?.fillOpacity).toBeCloseTo(0.5, 9);
    expect(part.props?.crashSpark?.fade).toBeCloseTo(0.5, 9);
    expect([part.body?.hover, part.body?.leanDegrees]).toEqual([undefined, undefined]);
    expect(partAt(1600).body?.fillOpacity).toBeUndefined();
    expect(partAt(1600).props).toBeUndefined();
  });

  test('the bright tint is 0.6 at 1300 and goes out by 2000, set on each frame', () => {
    expect(partAt(1300).body?.tint).toEqual({ role: 'emberLight', amount: 0.6 });
    expect(partAt(1650).body?.tint?.amount).toBeCloseTo(0.3, 9);
    expect(partAt(1650).exactFields).toEqual(['tint']);
    expect(partAt(2000).body?.tint).toBeUndefined();
  });

  test('1700 to 2200 the head shakes by 2 × (1 - p) × sin(t / 45), and the eyes close twice', () => {
    expect(partAt(1800).body?.addedShake).toBeCloseTo(2 * 0.8 * Math.sin(1800 / 45), 9);
    expect(partAt(2200).body?.addedShake).toBeUndefined();
    expect(partAt(1790).eyes?.height).toBe(1);
    expect(partAt(1990).eyes?.height).toBe(1);
    expect(partAt(1900).eyes?.height).toBeUndefined();
    expect(partAt(1900).exactFields).toEqual(['tint']);
  });

  test('2200 to 2800 Flint looks behind for 300 ms, then ahead', () => {
    expect(partAt(2300).eyes).toEqual({ shift: -3 });
    expect(partAt(2600).eyes).toEqual({ shift: 6 });
  });
});

test('one action of 2800 ms; reduced motion holds 900; the part does not depend on the facing', () => {
  expect(CRASH_RESUME_GESTURE.intents['crash-resume']).toEqual({ variant: 'normal', durationMilliseconds: 2800, stillMomentMilliseconds: 900 });
  expect(CRASH_RESUME_GESTURE.targetPose(inputAt(900, -1))).toEqual(partAt(900));
});
