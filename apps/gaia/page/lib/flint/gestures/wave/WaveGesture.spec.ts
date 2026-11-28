/**
 * Wave: one hand rocks beside the body. Greet is the same wave with the "Hi!" mark, which stops with it; a plain wave shows no mark. In the
 * sideways pose of a peek the hand keeps its distance ahead of the body on the screen.
 */
import { describe, expect, test } from 'bun:test';

import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }  from '../GestureDefinition.ts';
import { WAVE_GESTURE }       from './WaveGesture.ts';

function inputAt(elapsedMilliseconds: number, sidewaysWidth = 1, variant: 'normal' | 'greeting' = 'normal'): GestureInput<'normal' | 'greeting'> {
  return {
    elapsedMilliseconds, variant, facing: 1, sidewaysWidth, target: null, verdict: null,
  };
}

function greetingAt(elapsedMilliseconds: number): GestureInput<'normal' | 'greeting'> {
  return inputAt(elapsedMilliseconds, 1, 'greeting');
}

describe('facing the user', () => {
  test('one pentagon of radius 6.5 at (27 + 3 × rock, -34 - |rock|), turned 22 × rock degrees, with no far hand', () => {
    for (const elapsedMilliseconds of [0, 80, 230, 1500]) {
      const rock = Math.sin(elapsedMilliseconds / 100);
      const part = WAVE_GESTURE.targetPose(inputAt(elapsedMilliseconds));
      expect(part.nearHand).toMatchObject({ cornerCount: 5, radius: 6.5, placement: 'eased' });
      expect(part.nearHand?.centreX).toBeCloseTo(27 + (3 * rock));
      expect(part.nearHand?.centreY).toBeCloseTo(-34 - Math.abs(rock));
      expect(part.nearHand?.turnDegrees).toBeCloseTo(22 * rock);
      expect(part.farHand).toBeNull();
    }
  });

  test('the eyes are 9 high and shifted 6, and the body leans 5 degrees', () => {
    const part = WAVE_GESTURE.targetPose(inputAt(500));
    expect(part.eyes).toEqual({ height: 9, shift: 6 });
    expect(part.body?.leanDegrees).toBe(5);
  });

  test('the wave and the greet last 2.2 seconds', () => {
    expect([WAVE_GESTURE.intents.wave.durationMilliseconds, WAVE_GESTURE.intents.greet.durationMilliseconds]).toEqual([2200, 2200]);
  });

  test('the greet rocks the hand as the wave does', () => {
    expect(WAVE_GESTURE.targetPose(greetingAt(230)).nearHand).toEqual(WAVE_GESTURE.targetPose(inputAt(230)).nearHand);
  });
});

describe('the "Hi!" mark', () => {
  test('a plain wave shows no mark: only the greet that introduces Flint says "Hi!"', () => {
    expect([WAVE_GESTURE.intents.wave.variant, WAVE_GESTURE.intents.greet.variant]).toEqual(['normal', 'greeting']);
    for (const elapsedMilliseconds of [0, 200, 1500]) expect(WAVE_GESTURE.targetPose(inputAt(elapsedMilliseconds)).emoteMark).toBeNull();
  });

  test('a greet shows it at its anchor and springs in on its width and height over 200 ms', () => {
    for (const elapsedMilliseconds of [0, 50, 120, 200]) {
      const mark = WAVE_GESTURE.targetPose(greetingAt(elapsedMilliseconds)).emoteMark;
      const spring = AnimationCurveUtil.springScaleAt(elapsedMilliseconds / 200);
      expect(mark).toMatchObject({
        name: 'greeting', anchorX: 38, anchorY: -49.5, scale: 1.3,
      });
      expect(mark?.innerScaleX).toBeCloseTo(spring);
      expect(mark?.innerScaleY).toBeCloseTo(spring);
    }
  });

  test('it is not an emote: it stays fully shown to the end of the wave, with no fade', () => {
    const mark = WAVE_GESTURE.targetPose(greetingAt(2190)).emoteMark;
    expect(mark?.opacity).toBe(1);
    expect(mark?.innerScaleX).toBe(1);
  });
});

describe('the wave of a peek', () => {
  test('in the sideways pose the hand keeps its distance: its x is 21 divided by the width factor, plus the rock', () => {
    const rock = Math.sin(80 / 100);
    const part = WAVE_GESTURE.targetPose(inputAt(80, 0.8));
    expect(part.nearHand?.centreX).toBeCloseTo((21 / 0.8) + (3 * rock));
    expect(part.nearHand?.centreY).toBeCloseTo(-34 - Math.abs(rock));
  });

  test('the eye shift of the pop-in stays, and the eyes are 9 high', () => {
    expect(WAVE_GESTURE.targetPose(inputAt(80, 0.8)).eyes).toEqual({ height: 9 });
  });
});

describe('reduced motion', () => {
  test('the still moment holds the hand upright at (27, -34), and a greet\'s mark fully grown', () => {
    const part = WAVE_GESTURE.targetPose(inputAt(WAVE_GESTURE.intents.wave.stillMomentMilliseconds));
    expect(part.nearHand?.centreX).toBeCloseTo(27);
    expect(part.nearHand?.centreY).toBeCloseTo(-34);
    expect(part.nearHand?.turnDegrees).toBeCloseTo(0);
    expect(WAVE_GESTURE.targetPose(greetingAt(WAVE_GESTURE.intents.greet.stillMomentMilliseconds)).emoteMark?.innerScaleX).toBe(1);
  });
});
