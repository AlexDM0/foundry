/**
 * The Surprised emote. What matters: wide eyes (height 10); one hop of 6 units over 300 ms; and the "!" that springs in on the width
 * only.
 */
import { describe, expect, test } from 'bun:test';

import { AnimationCurveUtil } from '../utils/AnimationCurveUtil.ts';
import { SURPRISED_EMOTE }    from './SurprisedEmote.ts';

const partAt = (ageMilliseconds: number, reducedMotion = false) => SURPRISED_EMOTE.targetPose({ ageMilliseconds, facing: 1, reducedMotion });

describe('the Surprised emote', () => {
  test('opens its eyes wide', () => {
    expect(partAt(500).eyes).toEqual({ height: 10 });
  });

  test('hops once', () => {
    expect(partAt(150).body?.addedLift).toBeCloseTo(6, 9);
    expect(partAt(300).body?.addedLift).toBe(0);
    expect(partAt(150, true).body?.addedLift).toBe(0);
  });

  test('shows "!", springing in on the width only', () => {
    expect(partAt(100).emoteMark).toMatchObject({
      name: 'exclamation', anchorX: 20, anchorY: -54, scale: 1.5, innerScaleX: AnimationCurveUtil.springScaleAt(0.5), innerScaleY: 1,
    });
  });
});
