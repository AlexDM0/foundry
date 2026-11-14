/** The Doubt emote. What matters: only the right eye narrows to 5; the body leans 7 degrees more; the "?" springs in on the width only. */
import { describe, expect, test } from 'bun:test';

import { AnimationCurveUtil } from '../utils/AnimationCurveUtil.ts';
import { DOUBT_EMOTE }        from './DoubtEmote.ts';

const partAt = (ageMilliseconds: number) => DOUBT_EMOTE.targetPose({ ageMilliseconds, facing: 1, reducedMotion: false });

describe('the Doubt emote', () => {
  test('narrows only the right eye and leans 7 degrees more', () => {
    expect(partAt(500)).toMatchObject({ eyes: { rightHeightOverride: 5 }, body: { addedLeanDegrees: 7 } });
    expect(partAt(500).eyes).not.toHaveProperty('height');
  });

  test('shows "?", springing in on the width only', () => {
    expect(partAt(60).emoteMark).toMatchObject({
      name: 'question', anchorX: 20, anchorY: -54, scale: 1.5, innerScaleX: AnimationCurveUtil.springScaleAt(0.3), innerScaleY: 1,
    });
  });
});
