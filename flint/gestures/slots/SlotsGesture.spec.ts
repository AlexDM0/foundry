/**
 * Slots against `06-more-animations.md`, "Slots". What matters, in `slots`: spark n falls from y -56 into socket n at 0.5 + 0.9n s in 300
 * ms with `p²`, lands with a spring that overshoots from its full size, and lights its ring; a triangle straight above the socket that
 * fills points down at it, behind the falling spark, and the eyes follow; from 3.2 s the sparks breathe. In `slots-full`: every socket has
 * its spark; a pentagon holds a ticket above each socket in turn, 700 ms each, at y -42, and each ring refuses it in crimson for 300 ms;
 * from 2.6 s the ticket is held up at (40, -50), clear of the rail and the body, and Flint stands upright, sweats and waits. Both fade from
 * 4.4 s, repeat every 5 s, and hold their still moments under reduced motion.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }        from '../../SpriteGeometry.ts';
import { SPRING }             from '../../constants/Motion.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }  from '../GestureDefinition.ts';
import { SLOTS_GESTURE }      from './SlotsGesture.ts';

type SlotsVariant = 'normal' | 'full';

function partAt(elapsedMilliseconds: number, variant: SlotsVariant, facing: Facing = 1): ReturnType<typeof SLOTS_GESTURE.targetPose> {
  const input: GestureInput<SlotsVariant> = {
    elapsedMilliseconds, variant, facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return SLOTS_GESTURE.targetPose(input);
}

describe('slots', () => {
  test('0 to 0.3 s the rail fades in with three free sockets; the triangle points at socket 0 and the eyes look up for its spark', () => {
    const part = partAt(150, 'normal');
    expect(part.props?.slotRail).toMatchObject({ sceneOpacity: 0.5, sockets: ['free', 'free', 'free'], sheetOpacity: 0 });
    expect(part.props?.slotRail?.sparks.map((spark) => spark.opacity)).toEqual([0, 0, 0]);
    expect(part.nearHand).toBeNull();
    expect(part.farHand).toEqual({
      cornerCount: 3, centreX: 31, centreY: -41, radius: 5.5, turnDegrees: 180, placement: 'eased',
    });
    expect(part.eyes).toEqual({ height: 6, shift: 4, lift: -3 });
    expect(part.body).toEqual({ leanDegrees: 5 });
  });

  test('spark 0 falls from y -56 into its socket from 0.5 s, in 300 ms, with p²', () => {
    expect(partAt(650, 'normal').props?.slotRail?.sparks[0]).toMatchObject({ y: -49.5, opacity: 1 });
    expect(partAt(800, 'normal').props?.slotRail?.sparks[0]?.y).toBe(-30);
  });

  test('on landing the ring lights and the spark springs: it overshoots from its full size and settles in 200 ms', () => {
    const landed = partAt(800, 'normal').props?.slotRail;
    expect(landed?.sockets).toEqual(['lit', 'free', 'free']);
    expect(landed?.sparks[0]?.scale).toBeCloseTo(1);
    const springProgress = 0.075 + (0.925 * (75 / SPRING.DURATION_MILLISECONDS));
    expect(partAt(875, 'normal').props?.slotRail?.sparks[0]?.scale).toBeCloseTo(AnimationCurveUtil.springScaleAt(springProgress));
    expect(Math.max(...[820, 840, 860, 880].map((moment) => partAt(moment, 'normal').props?.slotRail?.sparks[0]?.scale ?? 0))).toBeGreaterThan(1.2);
    expect(partAt(1000, 'normal').props?.slotRail?.sparks[0]?.scale).toBe(1);
  });

  test('the triangle points at the socket that fills next, and the eyes shift with it', () => {
    expect(partAt(1300, 'normal').farHand).toMatchObject({ centreX: 40 });
    expect(partAt(1300, 'normal').eyes?.shift).toBe(5);
    expect(partAt(2500, 'normal').farHand).toMatchObject({ centreX: 49 });
    expect(partAt(2700, 'normal').props?.slotRail?.sockets).toEqual(['lit', 'lit', 'lit']);
  });

  test('from 3.2 s the hand goes and the sparks breathe by 1 + 0.08 × sin(t / 300 + n); from 4.4 s the props fade', () => {
    const part = partAt(3600, 'normal');
    expect([part.nearHand, part.farHand]).toEqual([null, null]);
    part.props?.slotRail?.sparks.forEach((spark, i) => expect(spark.scale).toBeCloseTo(1 + (0.08 * Math.sin(12 + i))));
    expect(partAt(4700, 'normal').props?.slotRail?.sceneOpacity).toBeCloseTo(0.5);
  });
});

describe('slots, full', () => {
  test('every socket has its spark from the start; a pentagon holds the ticket up at (40, -50)', () => {
    const part = partAt(400, 'full');
    expect(part.props?.slotRail).toMatchObject({
      sockets: ['lit', 'lit', 'lit'], sheetX: 40, sheetY: -50, sheetOpacity: 1
    });
    expect(part.props?.slotRail?.sparks.map((spark) => [spark.y, spark.opacity])).toEqual([[-30, 1], [-30, 1], [-30, 1]]);
    expect(part.nearHand).toMatchObject({ cornerCount: 5, radius: 5.5, placement: { heldTo: 'slotRail' } });
  });

  test('from 0.5 s the ticket goes above socket 0, 1 and 2 in turn, 700 ms each, at y -42; each ring refuses it for 300 ms', () => {
    expect(partAt(700, 'full').props?.slotRail).toMatchObject({ sheetX: 35.5, sheetY: -46, sockets: ['lit', 'lit', 'lit'] });
    expect(partAt(1000, 'full').props?.slotRail).toMatchObject({ sheetX: 31, sheetY: -42, sockets: ['refusing', 'lit', 'lit'] });
    expect(partAt(1700, 'full').props?.slotRail).toMatchObject({ sheetX: 40, sheetY: -42, sockets: ['lit', 'refusing', 'lit'] });
    expect(partAt(2400, 'full').props?.slotRail).toMatchObject({ sheetX: 49, sheetY: -42, sockets: ['lit', 'lit', 'refusing'] });
  });

  test('from 2.6 s the ticket is held up at (40, -50): eye height 5, upright, the sweat drop grows in and slides, and Flint waits', () => {
    const waiting = partAt(3200, 'full');
    expect(waiting.props?.slotRail).toMatchObject({ sheetX: 40, sheetY: -50, sockets: ['lit', 'lit', 'lit'] });
    expect(waiting.body).toEqual({ leanDegrees: 0 });
    expect(partAt(2400, 'full').body).toEqual({ leanDegrees: 5 });
    expect(waiting.eyes?.height).toBe(5);
    expect(waiting.emoteMark).toMatchObject({ name: 'sweat-drop', innerScaleX: 1, opacity: 1 });
    expect(partAt(2650, 'full').emoteMark?.innerScaleX).toBeCloseTo(0.8);
    expect(partAt(2500, 'full').emoteMark).toBeUndefined();
  });

  test('from 4.4 s the props fade, and the hand and the drop go', () => {
    expect(partAt(4700, 'full').props?.slotRail?.sceneOpacity).toBeCloseTo(0.5);
    expect(partAt(4400, 'full').nearHand).toBeNull();
    expect(partAt(4400, 'full').emoteMark).toBeUndefined();
  });
});

test('each variant repeats every 5 s; only the breathing of the sparks runs on the gesture\'s own time', () => {
  for (const moment of [150, 1000, 2400, 3200]) expect(partAt(5000 + moment, 'full')).toEqual(partAt(moment, 'full'));
  for (const moment of [150, 875, 2500]) expect(partAt(5000 + moment, 'normal')).toEqual(partAt(moment, 'normal'));
});

test('facing left gives the same part: the renderer mirrors it, and the sockets are no reading order', () => {
  for (const moment of [650, 1700, 3600]) {
    expect(partAt(moment, 'normal', -1)).toEqual(partAt(moment, 'normal', 1));
    expect(partAt(moment, 'full', -1)).toEqual(partAt(moment, 'full', 1));
  }
});

test('two intents, loops; reduced motion holds three lit sockets, and the full ticket waiting with its drop', () => {
  expect(SLOTS_GESTURE.intents).toEqual({
    'slots':      { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 3400 },
    'slots-full': { variant: 'full', durationMilliseconds: null, stillMomentMilliseconds: 2800 },
  });
  expect(partAt(3400, 'normal').props?.slotRail?.sockets).toEqual(['lit', 'lit', 'lit']);
  expect(partAt(2800, 'full').emoteMark?.name).toBe('sweat-drop');
});
