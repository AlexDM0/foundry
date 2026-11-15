/**
 * The variant part that typing and reviewing share, against `02-animations.md`, "Type" and "Review". What matters: each variant's lean and eye
 * height; the busy bob of 0.8 × sin(t / 50) as a lift; the angry shake of 0.8 × sin(t / 28), the glare of 20 degrees and the vein that
 * pulses by 1 + 0.1 × sin(t / 95) without a spring; and no mark outside the angry variant.
 */
import { expect, test } from 'bun:test';

import { workingVariantPartOf } from './WorkingVariantPart.ts';

test('the normal variant leans 5 degrees with eyes 6 high, shifted 6, and shows no mark', () => {
  expect(workingVariantPartOf('normal', 300)).toEqual({ body: { leanDegrees: 5 }, eyes: { shift: 6, height: 6 } });
});

test('the busy variant leans 9 degrees with eyes 4 high and bobs by 0.8 × sin(t / 50)', () => {
  const part = workingVariantPartOf('busy', 40);
  expect(part.body?.leanDegrees).toBe(9);
  expect(part.body?.addedLift).toBeCloseTo(0.8 * Math.sin(40 / 50));
  expect(part.eyes?.height).toBe(4);
  expect(part.emoteMark).toBeUndefined();
});

test('the angry variant leans 7 degrees, glares with eyes 7 high and slanted 20 degrees, and shakes by 0.8 × sin(t / 28)', () => {
  const part = workingVariantPartOf('angry', 20);
  expect(part.body?.leanDegrees).toBe(7);
  expect(part.body?.addedShake).toBeCloseTo(0.8 * Math.sin(20 / 28));
  expect(part.eyes).toEqual({ shift: 6, height: 7, slantDegrees: 20 });
});

test('the angry vein shows at its anchor at once, fully opaque, and pulses its scale by 1 + 0.1 × sin(t / 95)', () => {
  for (const elapsedMilliseconds of [0, 60, 149]) {
    const vein = workingVariantPartOf('angry', elapsedMilliseconds).emoteMark;
    const pulse = 1 + (0.1 * Math.sin(elapsedMilliseconds / 95));
    expect(vein).toMatchObject({
      name: 'anger-vein', anchorX: 18, anchorY: -52, scale: 1.05, opacity: 1,
    });
    expect(vein?.innerScaleX).toBeCloseTo(pulse);
    expect(vein?.innerScaleY).toBeCloseTo(pulse);
  }
});
