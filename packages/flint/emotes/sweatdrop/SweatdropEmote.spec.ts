/**
 * The Sweatdrop emote. What matters: the eyes (height 6, shift -1); the drop at its anchor and scale 1.45, never another; it grows from
 * 60% to full size in the first 100 ms with no spring; it slides 9 units down over 1300 ms; and under reduced motion it holds still.
 */
import { describe, expect, test } from 'bun:test';

import { SWEATDROP_EMOTE } from './SweatdropEmote.ts';

const markAt = (ageMilliseconds: number, reducedMotion = false) => SWEATDROP_EMOTE.targetPose({ ageMilliseconds, facing: 1, reducedMotion }).emoteMark;

describe('the Sweatdrop emote', () => {
  test('looks away', () => {
    expect(SWEATDROP_EMOTE.targetPose({ ageMilliseconds: 500, facing: 1, reducedMotion: false }).eyes).toEqual({ height: 6, shift: -1 });
  });

  test('shows the sweat drop at scale 1.45', () => {
    expect(markAt(500)).toMatchObject({ name: 'sweat-drop', anchorX: 13, scale: 1.45 });
  });

  test('grows from 60% to full size in the first 100 ms', () => {
    expect(markAt(0)).toMatchObject({ innerScaleX: 0.6, innerScaleY: 0.6 });
    expect(markAt(50)?.innerScaleX).toBeCloseTo(0.8, 9);
    expect(markAt(100)).toMatchObject({ innerScaleX: 1, innerScaleY: 1 });
  });

  test('slides 9 units down over 1300 ms, then stays', () => {
    expect(markAt(0)?.anchorY).toBe(-48);
    expect(markAt(650)?.anchorY).toBeCloseTo(-43.5, 9);
    expect(markAt(1300)?.anchorY).toBe(-39);
    expect(markAt(1400)?.anchorY).toBe(-39);
  });

  test('under reduced motion the drop holds still at its anchor, at full size', () => {
    expect(markAt(650, true)).toMatchObject({ anchorY: -48, innerScaleX: 1, innerScaleY: 1 });
  });
});
