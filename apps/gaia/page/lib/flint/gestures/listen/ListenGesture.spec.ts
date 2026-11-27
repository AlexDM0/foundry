/**
 * Quiet job: Flint listens to the block, taps it twice with its tip going into the block, then leans back in doubt with the question mark.
 */
import { describe, expect, test } from 'bun:test';

import { poseWithPart }       from '../../PoseComposition.ts';
import { easedPoseOf }        from '../../PoseEasing.ts';
import { NEUTRAL_POSE }       from '../../SpritePose.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }  from '../GestureDefinition.ts';
import { LISTEN_GESTURE }     from './ListenGesture.ts';

function inputAt(elapsedMilliseconds: number): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing: 1, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => LISTEN_GESTURE.targetPose(inputAt(elapsedMilliseconds));

test('the block fades in over the first 300 ms of the gesture, and stays in the cycles after it', () => {
  expect(partAt(150).props?.listenBlock).toEqual({ shown: 1, opacity: 0.5, drop: 0 });
  expect(partAt(3600 + 150).props?.listenBlock?.opacity).toBe(1);
});

test('from 300 Flint listens: lean 12, eye height 3, right eye height 6, eye shift 6, with no hand', () => {
  const part = partAt(900);
  expect(part.body?.leanDegrees).toBe(12);
  expect(part.eyes).toEqual({ height: 3, rightHeightOverride: 6, shift: 6 });
  expect(part.nearHand).toBeNull();
});

describe('the taps', () => {
  test('from 1500 one triangle of radius 5.5, turn 180, at (37, -38)', () => {
    expect(partAt(1550).nearHand).toMatchObject({
      cornerCount: 3, centreX: 37, centreY: -38, radius: 5.5, turnDegrees: 180,
    });
  });

  test('a tap at 1600 and at 1900: the hand 5 down at its middle and back, and the block 0.8 lower for 100 ms', () => {
    for (const middleOfTap of [1650, 1950, 3600 + 1650]) {
      const part = partAt(middleOfTap);
      expect(part.nearHand?.centreY).toBeCloseTo(-33);
      expect(part.props?.listenBlock?.drop).toBe(0.8);
    }
    expect(partAt(1750).nearHand?.centreY).toBe(-38);
    expect(partAt(1750).props?.listenBlock?.drop).toBe(0);
  });

  test('the drawn tapper goes the full 5 down at the middle of a tap, so its tip reaches into the block at y -30', () => {
    const frameMilliseconds = 16;
    let drawn = NEUTRAL_POSE;
    for (let time = 1500; time <= 1650; time += frameMilliseconds / 2) {
      drawn = easedPoseOf(drawn, poseWithPart(NEUTRAL_POSE, partAt(time)), frameMilliseconds / 2);
    }
    expect(drawn.nearHand?.placement).toBe('exact-position');
    expect((drawn.nearHand?.centreY ?? 0) + 5.5).toBeGreaterThan(-30);
  });
});

describe('the doubt', () => {
  test('from 2300: lean 5, right eye height 5, and the hand goes away', () => {
    const part = partAt(2600);
    expect(part.body?.leanDegrees).toBe(5);
    expect(part.eyes?.rightHeightOverride).toBe(5);
    expect(part.nearHand).toBeNull();
  });

  test('the question mark springs in on its width over 200 ms from 2300', () => {
    for (const elapsedMilliseconds of [2300, 2350, 2450]) {
      const mark = partAt(elapsedMilliseconds).emoteMark;
      expect(mark).toMatchObject({
        name: 'question', anchorX: 20, anchorY: -54, opacity: 1,
      });
      expect(mark?.innerScaleX).toBeCloseTo(AnimationCurveUtil.springScaleAt((elapsedMilliseconds - 2300) / 200));
    }
  });

  test('it fades out and shrinks to 60% in the last 160 ms of the cycle', () => {
    const mark = partAt(3600 - 80).emoteMark;
    expect(mark?.opacity).toBeCloseTo(0.5);
    expect(mark?.scale).toBeCloseTo(1.5 * 0.8);
  });

  test('before 2300 no mark shows', () => {
    expect(partAt(2200).emoteMark).toBeUndefined();
  });
});

test('it loops, and reduced motion holds the doubt with the mark fully grown', () => {
  const form = LISTEN_GESTURE.intents.listen;
  expect([form.variant, form.durationMilliseconds, form.stillMomentMilliseconds]).toEqual(['normal', null, 2600]);
  const mark = partAt(form.stillMomentMilliseconds).emoteMark;
  expect([mark?.opacity, mark?.innerScaleX, mark?.scale]).toEqual([1, 1, 1.5]);
});
