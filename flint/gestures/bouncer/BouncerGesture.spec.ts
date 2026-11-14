/**
 * Bouncer against `06-more-animations.md`, "Bouncer". What matters: both variants loop every 2.4 seconds with one hexagon on the rope;
 * refuse stands firm and wide with narrowed eyes, shakes its head only from 600 to 1400 and shows the cross only from 600 to 1600; admit
 * unhooks the rope by 600 standing upright, steps aside with a tick, shows happy eyes only from 900 to 1500, lets go at 1800 and fades the props; reduced
 * motion holds 1000 of each; and facing left changes nothing in the part, since the verdicts are never mirrored.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }         from '../../SpriteGeometry.ts';
import type { GestureInput }   from '../GestureDefinition.ts';
import type { BouncerVariant } from './BouncerGesture.ts';
import { BOUNCER_GESTURE }     from './BouncerGesture.ts';

function inputAt(elapsedMilliseconds: number, variant: BouncerVariant, facing: Facing = 1): GestureInput<BouncerVariant> {
  return {
    elapsedMilliseconds, variant, facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number, variant: BouncerVariant, facing: Facing = 1) => BOUNCER_GESTURE.targetPose(inputAt(elapsedMilliseconds, variant, facing));

test('the intents are refuse and admit, two loops that reduced motion holds at 1000', () => {
  expect(Object.entries(BOUNCER_GESTURE.intents).map(([intent, form]) => [intent, form.variant, form.durationMilliseconds, form.stillMomentMilliseconds])).toEqual([
    ['refuse', 'refuse', null, 1000],
    ['admit', 'admit', null, 1000],
  ]);
});

describe('refuse', () => {
  test('one hexagon of radius 7 at (26, -26) holds the hooked rope; Flint stands firm and wide, with narrowed eyes', () => {
    const part = partAt(100, 'refuse');
    expect(part.nearHand).toEqual({
      cornerCount: 6, centreX: 26, centreY: -26, radius: 7, turnDegrees: 0, placement: 'eased',
    });
    expect(part.farHand).toBeNull();
    expect(part.body).toEqual({ leanDegrees: 0, widthFactor: 1.04 });
    expect(part.eyes).toEqual({ height: 6, slantDegrees: 8, shift: 2 });
    expect(part.props?.bouncerBarrier).toEqual({
      shown: 1, cycleOpacity: 1, unhooked: 0, crossOpacity: 0, tickOpacity: 0,
    });
  });

  test('Flint shakes its head by 2 × sin(t / 90) from 600 to 1400 only', () => {
    expect(partAt(599, 'refuse').body?.addedShake).toBeUndefined();
    expect(partAt(1000, 'refuse').body?.addedShake).toBeCloseTo(2 * Math.sin(1000 / 90));
    expect(partAt(1400, 'refuse').body?.addedShake).toBeUndefined();
  });

  test('the cross shows above the post from 600 to 1600 only', () => {
    expect([599, 600, 1599, 1600].map((moment) => partAt(moment, 'refuse').props?.bouncerBarrier?.crossOpacity)).toEqual([0, 1, 1, 0]);
  });
});

describe('admit', () => {
  test('0 to 600: the hand unhooks the rope while Flint works on it, upright so the body does not lean into the hand', () => {
    expect(partAt(300, 'admit').props?.bouncerBarrier?.unhooked).toBeCloseTo(0.5);
    expect(partAt(600, 'admit').props?.bouncerBarrier?.unhooked).toBe(1);
    expect(partAt(300, 'admit').body).toEqual({ leanDegrees: 0 });
    expect(partAt(300, 'admit').nearHand).toMatchObject({ cornerCount: 6, centreX: 26, centreY: -26 });
  });

  test('600 to 1800: Flint steps aside with the tick; the happy eyes show from 900 to 1500 only', () => {
    const part = partAt(1000, 'admit');
    expect(part.body).toEqual({ leanDegrees: -4 });
    expect(part.eyes).toEqual({ shift: 6, happiness: 1 });
    expect(part.props?.bouncerBarrier).toMatchObject({ tickOpacity: 1, crossOpacity: 0, cycleOpacity: 1 });
    expect([899, 900, 1499, 1500].map((moment) => partAt(moment, 'admit').eyes?.happiness)).toEqual([undefined, 1, 1, undefined]);
  });

  test('1800 to 2400: the hand lets go and the props fade', () => {
    const part = partAt(2100, 'admit');
    expect(part.nearHand).toBeNull();
    expect(part.props?.bouncerBarrier?.cycleOpacity).toBeCloseTo(0.5);
    expect(part.body).toEqual({ leanDegrees: 0 });
  });

  test('the next cycle hooks the rope again and fades the props back in', () => {
    expect(partAt(2400, 'admit').props?.bouncerBarrier).toMatchObject({ unhooked: 0, cycleOpacity: 0, tickOpacity: 0 });
    expect(partAt(2400 + 150, 'admit').props?.bouncerBarrier?.cycleOpacity).toBeCloseTo(0.5);
  });
});

test('both variants repeat every 2.4 seconds', () => {
  for (const variant of ['refuse', 'admit'] as const) {
    for (const moment of [100, 700, 1000, 2000]) expect(partAt(2400 + moment, variant)).toEqual(partAt(moment, variant));
  }
});

test('the still moment of 1000 shows the cross for refuse, and the hanging rope, the tick and happy eyes for admit', () => {
  expect(partAt(BOUNCER_GESTURE.intents.refuse.stillMomentMilliseconds, 'refuse').props?.bouncerBarrier?.crossOpacity).toBe(1);
  const admitted = partAt(BOUNCER_GESTURE.intents.admit.stillMomentMilliseconds, 'admit');
  expect(admitted.props?.bouncerBarrier).toMatchObject({ unhooked: 1, tickOpacity: 1 });
  expect(admitted.eyes?.happiness).toBe(1);
});

test('facing left gives the same part: the renderer mirrors the pose and mirrors the verdicts back', () => {
  for (const variant of ['refuse', 'admit'] as const) {
    for (const moment of [100, 1000, 2100]) expect(partAt(moment, variant, -1)).toEqual(partAt(moment, variant, 1));
  }
});
