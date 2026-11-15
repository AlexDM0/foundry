/**
 * Sandbox against `06-more-animations.md`, "Sandbox". What matters: the 4-second loop types in the normal mood until 1800; the pentagon
 * reaches out level and is stopped at 2150 exactly where its edge meets the dome, which lights up and ripples there; it springs back to
 * (28, -30) with a wobble; the sweat drop shows from 2400 to 3600 with the eyes of the Sweatdrop emote and no near hand; the hands go back
 * to the typing places; reduced motion holds the contact; the part does not depend on the facing.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { SANDBOX_GESTURE }   from './SandboxGesture.ts';

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number, facing: Facing = 1) => SANDBOX_GESTURE.targetPose(inputAt(elapsedMilliseconds, facing));

test('sandbox is one loop that reduced motion holds at the contact, 2150', () => {
  expect(SANDBOX_GESTURE.intents.sandbox).toEqual({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2150 });
});

describe('the loop', () => {
  test('0 to 1800: two squares type in the normal mood on the keyboard, under the dome at rest', () => {
    const part = partAt(500);
    const swing = 0.5 * Math.sin(500 / 64);
    expect(part.nearHand).toMatchObject({
      cornerCount: 4, centreX: 22, radius: 6.4, turnDegrees: 45, placement: 'eased',
    });
    expect(part.nearHand?.centreY).toBeCloseTo(-10 - (4 * (0.5 + swing)));
    expect(part.farHand?.centreY).toBeCloseTo(-13 - (4 * (0.5 - swing)));
    expect(part.eyes).toEqual({ height: 6, shift: 6, lift: 2 });
    expect(part.body).toEqual({ leanDegrees: 5 });
    expect(part.props).toEqual({ keyboard: { shown: 1, drop: 0 }, sandboxDome: { shown: 1, flash: 0, ripplesOpacity: 0 } });
    expect(part.emoteMark).toBeNull();
  });

  test('1800 to 2150: the near hand is a pentagon of radius 5 that goes out level at y -34, placed exactly; the far hand rests', () => {
    const part = partAt(1975);
    expect(part.nearHand).toEqual({
      cornerCount: 5, centreX: 22.5, centreY: -34, radius: 5, turnDegrees: 0, placement: 'exact-position',
    });
    expect(part.farHand).toMatchObject({ centreX: 30, centreY: -13, radius: 5.8 });
  });

  test('2150: the hand stops at (29, -34), where its edge meets the dome; the dome is at full opacity and the ripples show', () => {
    const part = partAt(2150);
    expect(part.nearHand).toMatchObject({ centreX: 29, centreY: -34 });
    const domeEdgeX = 4 + (38 * Math.sqrt(1 - ((40 / 64) ** 2)));
    expect(Math.abs((29 + 5) - domeEdgeX)).toBeLessThan(0.5);
    expect(part.props?.sandboxDome).toEqual({ shown: 1, flash: 1, ripplesOpacity: 1 });
  });

  test('the dome goes back to its rest in 400 ms and the ripples fade in 300 ms', () => {
    expect(partAt(2350).props?.sandboxDome?.flash).toBeCloseTo(0.5);
    expect(partAt(2300).props?.sandboxDome?.ripplesOpacity).toBeCloseTo(0.5);
    expect(partAt(2450).props?.sandboxDome).toEqual({ shown: 1, flash: 0.25, ripplesOpacity: 0 });
    expect(partAt(2550).props?.sandboxDome?.flash).toBe(0);
  });

  test('2150 to 2400: the hand goes back to (28, -30), turning by 20 × sin(3π × p)', () => {
    expect(partAt(2150 + (250 / 6)).nearHand?.turnDegrees).toBeCloseTo(20);
    expect(partAt(2399.999).nearHand).toMatchObject({ centreX: expect.closeTo(28, 2), centreY: expect.closeTo(-30, 2) });
  });

  test('2400 to 3600: the sweat drop shows, with the eyes of the Sweatdrop emote, and the near hand goes away', () => {
    const part = partAt(3050);
    expect(part.nearHand).toBeNull();
    expect(part.eyes).toEqual({ height: 6, shift: -1 });
    expect(part.emoteMark).toMatchObject({
      name: 'sweat-drop', anchorX: 13, anchorY: -43.5, innerScaleX: 1, opacity: 1,
    });
    expect(partAt(2400).emoteMark).toMatchObject({ innerScaleX: 0.6, anchorY: -48 });
    expect(partAt(3520).emoteMark?.opacity).toBeCloseTo(0.5);
  });

  test('3600 to 4000: both hands go back to the typing places', () => {
    const part = partAt(3800);
    expect(part.nearHand).toMatchObject({ cornerCount: 4, centreX: 22, centreY: -10 });
    expect(part.farHand).toMatchObject({ cornerCount: 4, centreX: 30, centreY: -13 });
    expect(part.emoteMark).toBeNull();
  });

  test('the loop repeats every 4 seconds', () => {
    for (const moment of [500, 1975, 2150, 3050, 3800]) expect(partAt(4000 + moment)).toEqual(partAt(moment));
  });
});

test('reduced motion holds the hand on the lit dome', () => {
  const part = partAt(SANDBOX_GESTURE.intents.sandbox.stillMomentMilliseconds);
  expect(part.nearHand).toMatchObject({ cornerCount: 5, centreX: 29, centreY: -34 });
  expect(part.props?.sandboxDome?.flash).toBe(1);
});

test('facing left gives the same part: the renderer mirrors the pose with its dome', () => {
  for (const moment of [500, 2150, 3050]) expect(partAt(moment, -1)).toEqual(partAt(moment, 1));
});
