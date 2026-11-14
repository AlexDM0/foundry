/**
 * Wave against `02-animations.md`, "Wave" and "Pop-in around a corner", step 7. What matters: one pentagon of radius 7 rocks with
 * `rock = sin(t / 100)` around (27, -41); the eyes are 9 high, shifted 6, and the body leans 5; the "Hi!" mark springs in on its width
 * and height and stops with the wave, with no fade; the wave lasts 2.2 seconds; in the sideways pose of a peek the hand keeps its
 * distance of 21 ahead of the body on the screen and the eye shift of the pop-in stays; reduced motion holds the hand upright.
 */
import { describe, expect, test } from 'bun:test';

import { AnimationCurveUtil } from '../utils/AnimationCurveUtil.ts';
import type { GestureInput }  from './GestureDefinition.ts';
import { WAVE_GESTURE }       from './WaveGesture.ts';

function inputAt(elapsedMilliseconds: number, sidewaysWidth = 1): GestureInput {
  return {
    elapsedMilliseconds, mood: 'normal', facing: 1, sidewaysWidth, target: null, verdict: null,
  };
}

describe('facing the user', () => {
  test('one pentagon of radius 7 at (27 + 3 × rock, -41 - |rock|), turned 22 × rock degrees, with no far hand', () => {
    for (const elapsedMilliseconds of [0, 80, 230, 1500]) {
      const rock = Math.sin(elapsedMilliseconds / 100);
      const part = WAVE_GESTURE.targetPose(inputAt(elapsedMilliseconds));
      expect(part.nearHand).toMatchObject({ cornerCount: 5, radius: 7, placement: 'eased' });
      expect(part.nearHand?.centreX).toBeCloseTo(27 + (3 * rock));
      expect(part.nearHand?.centreY).toBeCloseTo(-41 - Math.abs(rock));
      expect(part.nearHand?.turnDegrees).toBeCloseTo(22 * rock);
      expect(part.farHand).toBeNull();
    }
  });

  test('the eyes are 9 high and shifted 6, and the body leans 5 degrees', () => {
    const part = WAVE_GESTURE.targetPose(inputAt(500));
    expect(part.eyes).toEqual({ height: 9, shift: 6 });
    expect(part.body?.leanDegrees).toBe(5);
  });

  test('the wave lasts 2.2 seconds', () => {
    expect(WAVE_GESTURE.durationMilliseconds).toBe(2200);
  });
});

describe('the "Hi!" mark', () => {
  test('it shows at its anchor and springs in on its width and height over 200 ms', () => {
    for (const elapsedMilliseconds of [0, 50, 120, 200]) {
      const mark = WAVE_GESTURE.targetPose(inputAt(elapsedMilliseconds)).emoteMark;
      const spring = AnimationCurveUtil.springScaleAt(elapsedMilliseconds / 200);
      expect(mark).toMatchObject({
        name: 'greeting', anchorX: 38, anchorY: -58, scale: 1.5,
      });
      expect(mark?.innerScaleX).toBeCloseTo(spring);
      expect(mark?.innerScaleY).toBeCloseTo(spring);
    }
  });

  test('it is not an emote: it stays fully shown to the end of the wave, with no fade', () => {
    const mark = WAVE_GESTURE.targetPose(inputAt(2190)).emoteMark;
    expect(mark?.opacity).toBe(1);
    expect(mark?.innerScaleX).toBe(1);
  });
});

describe('the wave of a peek', () => {
  test('in the sideways pose the hand keeps its distance: its x is 21 divided by the width factor, plus the rock', () => {
    const rock = Math.sin(80 / 100);
    const part = WAVE_GESTURE.targetPose(inputAt(80, 0.8));
    expect(part.nearHand?.centreX).toBeCloseTo((21 / 0.8) + (3 * rock));
    expect(part.nearHand?.centreY).toBeCloseTo(-41 - Math.abs(rock));
  });

  test('the eye shift of the pop-in stays, and the eyes are 9 high', () => {
    expect(WAVE_GESTURE.targetPose(inputAt(80, 0.8)).eyes).toEqual({ height: 9 });
  });
});

describe('reduced motion', () => {
  test('the still moment holds the hand upright at (27, -41) with the mark fully grown', () => {
    const part = WAVE_GESTURE.targetPose(inputAt(WAVE_GESTURE.stillMomentMilliseconds));
    expect(part.nearHand?.centreX).toBeCloseTo(27);
    expect(part.nearHand?.centreY).toBeCloseTo(-41);
    expect(part.nearHand?.turnDegrees).toBeCloseTo(0);
    expect(part.emoteMark?.innerScaleX).toBe(1);
  });
});
