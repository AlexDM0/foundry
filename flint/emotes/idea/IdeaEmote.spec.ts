/**
 * The Idea emote. What matters: wide eyes and one hop; the lightbulb springs in on both axes; its rays show after 260 ms at
 * 0.35 + 0.2 × sin(age / 130), and without the flicker under reduced motion.
 */
import { describe, expect, test } from 'bun:test';

import type { PosePart }      from '../../SpritePose.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import { IDEA_EMOTE }         from './IdeaEmote.ts';

function raysOpacityOf(part: PosePart): number | null {
  const mark = part.emoteMark;
  return mark?.name === 'lightbulb' ? mark.details.raysOpacity : null;
}

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
    expect(raysOpacityOf(partAt(260))).toBe(0);
    expect(raysOpacityOf(partAt(390))).toBeCloseTo(0.35 + (0.2 * Math.sin(3)), 9);
  });

  test('under reduced motion the rays show steady', () => {
    expect(raysOpacityOf(partAt(390, true))).toBe(0.35);
  });
});
