/**
 * The Idea emote. What matters: wide eyes and one hop; the lightbulb springs in on both axes; its rays show after 260 ms at
 * 0.35 + 0.2 × sin(age / 130), and without the flicker under reduced motion.
 */
import { describe, expect, test } from 'bun:test';

import { AnimationCurveUtil } from '../utils/AnimationCurveUtil.ts';
import { IDEA_EMOTE }         from './IdeaEmote.ts';

const partAt = (ageMilliseconds: number, reducedMotion = false) => IDEA_EMOTE.targetPose({ ageMilliseconds, facing: 1, reducedMotion });

describe('the Idea emote', () => {
  test('opens its eyes wide and hops once', () => {
    expect(partAt(150)).toMatchObject({ eyes: { height: 10 } });
    expect(partAt(150).body?.addedLift).toBeCloseTo(6, 9);
  });

  test('the lightbulb springs in on the width and the height', () => {
    const spring = AnimationCurveUtil.springScaleAt(0.4);
    expect(partAt(80).emoteMark).toMatchObject({ name: 'lightbulb', innerScaleX: spring, innerScaleY: spring });
  });

  test('the rays show after 260 ms and flicker', () => {
    expect(partAt(260).emoteMark?.lightbulbRaysOpacity).toBe(0);
    expect(partAt(390).emoteMark?.lightbulbRaysOpacity).toBeCloseTo(0.35 + (0.2 * Math.sin(3)), 9);
  });

  test('under reduced motion the rays show steady', () => {
    expect(partAt(390, true).emoteMark?.lightbulbRaysOpacity).toBe(0.35);
  });
});
