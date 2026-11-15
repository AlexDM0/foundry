/**
 * The Annoyed emote. What matters: the glare (height 7, slant 20); the sideways shake of 1.5 × sin(age / 30) that stops at 1100 ms; the
 * anger vein at its anchor, springing in on both axes and then pulsing by 10%; and under reduced motion no shake and no pulse.
 */
import { describe, expect, test } from 'bun:test';

import { ANNOYED_EMOTE } from './AnnoyedEmote.ts';

const partAt = (ageMilliseconds: number, reducedMotion = false) => ANNOYED_EMOTE.targetPose({ ageMilliseconds, facing: 1, reducedMotion });

describe('the Annoyed emote', () => {
  test('glares', () => {
    expect(partAt(500).eyes).toEqual({ height: 7, slantDegrees: 20 });
  });

  test('shakes sideways for 1100 ms, then holds still', () => {
    expect(partAt(500).body?.addedShake).toBeCloseTo(1.5 * Math.sin(500 / 30), 9);
    expect(partAt(1100).body?.addedShake).toBe(0);
  });

  test('shows the anger vein at its anchor, springing in on the width and the height', () => {
    expect(partAt(0).emoteMark).toMatchObject({
      name: 'anger-vein', anchorX: 18, anchorY: -52, scale: 1.05, innerScaleX: 0, innerScaleY: 0,
    });
  });

  test('the vein pulses by 10% once it has sprung in', () => {
    const mark = partAt(400).emoteMark;
    expect(mark?.innerScaleX).toBeCloseTo(1 + (0.1 * Math.sin(400 / 95)), 9);
    expect(mark?.innerScaleY).toBe(mark?.innerScaleX ?? Number.NaN);
  });

  test('under reduced motion it glares with a still vein and no shake', () => {
    const part = partAt(500, true);
    expect(part.body?.addedShake).toBe(0);
    expect(part.emoteMark).toMatchObject({ innerScaleX: 1, innerScaleY: 1 });
  });
});
