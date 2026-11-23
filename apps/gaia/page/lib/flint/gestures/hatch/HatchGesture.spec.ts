/**
 * Hatch. What matters: the pentagon holds the note so it reaches the slot, and pushes it in along a path
 * set exactly; the note goes in from its far end; Flint waits with the thinking dots, all three whole before they leave as an emote's mark
 * leaves. In `hatch` the reply comes out of the slot and the hand takes it, Flint reads it, gets the tick, and is happy from 3200. In
 * `hatch-queued` no reply comes, the dots wait on until 2900, and Flint shrugs with a stub and the sweat drop; the stub stays at the wait
 * place after the hand has gone at 3600 and fades with the wall. Each intent loops, with its own still moment. Nothing in it is read or
 * written in a direction, so the part is the same either facing.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { HATCH_GESTURE }     from './HatchGesture.ts';

type HatchVariant = 'normal' | 'queued';

function inputAt(elapsedMilliseconds: number, variant: HatchVariant = 'normal', facing: Facing = 1): GestureInput<HatchVariant> {
  return {
    elapsedMilliseconds, variant, facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number, variant: HatchVariant = 'normal') => HATCH_GESTURE.targetPose(inputAt(elapsedMilliseconds, variant));

describe('both variants', () => {
  test('0 to 300: the wall fades in, and one pentagon of 5.5 holds the note at (30, -29), which reaches the slot', () => {
    const part = partAt(150);
    expect(part.props?.hatchWall?.cycleOpacity).toBeCloseTo(0.5);
    expect(part.nearHand).toEqual({
      cornerCount: 5, radius: 5.5, turnDegrees: 0, centreX: 30, centreY: -29, placement: 'eased',
    });
    expect(part.props?.hatchWall?.note).toEqual({ nearX: 35, centreY: -29, opacity: 1 });
  });

  test('600 to 1100: the hand pushes the note into the slot along a path set exactly', () => {
    expect(partAt(850).nearHand).toMatchObject({ centreX: 34.5, placement: 'exact-position' });
    expect(partAt(850).props?.hatchWall?.note.nearX).toBe(39.5);
    expect(partAt(1100).props?.hatchWall?.note.opacity).toBe(0);
  });

  test('from 1100 the hand moves back to (28, -26), the eye shift is 7, and the thinking dots show one by one', () => {
    const part = partAt(1800);
    expect(part.nearHand).toMatchObject({ centreX: 28, centreY: -26, placement: 'eased' });
    expect(part.eyes).toEqual({ shift: 7 });
    expect(part.emoteMark?.name).toBe('thinking-dots');
    expect(partAt(1300).emoteMark?.details).toEqual({ dotsShown: 1 });
    expect(partAt(2000).emoteMark).toMatchObject({ details: { dotsShown: 3 }, opacity: 1 });
  });

  test('3600 to 4400: the props fade out and the hand goes', () => {
    expect(partAt(4000).props?.hatchWall?.cycleOpacity).toBeCloseTo(0.5);
    expect(partAt(4000).nearHand).toBeNull();
    expect(partAt(4000, 'queued').props?.hatchWall?.cycleOpacity).toBeCloseTo(0.5);
  });
});

describe('hatch', () => {
  test('the dots leave in the last 160 ms before the reply comes', () => {
    expect(partAt(2220).emoteMark?.opacity).toBeCloseTo(0.5);
    expect(partAt(2300).emoteMark).toBeNull();
  });

  test('2300 to 2800: the reply comes out of the slot, and the hand takes it at (33, -29)', () => {
    expect(partAt(2550).props?.hatchWall?.reply).toEqual({ nearX: 39.5, centreY: -29, opacity: 1 });
    expect(partAt(2800).props?.hatchWall?.reply.nearX).toBe(35);
    expect(partAt(2550).nearHand).toMatchObject({ centreX: 33, centreY: -29 });
  });

  test('2800 to 3600: Flint reads it with eye height 5 and lift 2, the small tick shows, and the happy eyes from 3200', () => {
    expect(partAt(2799).props?.hatchWall?.replyTickOpacity).toBe(0);
    expect(partAt(3000).props?.hatchWall?.replyTickOpacity).toBe(1);
    expect(partAt(3000).eyes).toEqual({ shift: 6, height: 5, lift: 2 });
    expect(partAt(3200).eyes?.happiness).toBe(1);
  });

  test('no stub, no shrug and no sweat drop', () => {
    expect(partAt(3000).props?.hatchWall?.stub.opacity).toBe(0);
    expect(partAt(3000).body).toEqual({ leanDegrees: 5 });
    expect(partAt(3000).emoteMark).toBeNull();
  });
});

describe('hatch-queued', () => {
  test('no reply comes, and the dots wait on until 2900', () => {
    expect(partAt(2600, 'queued').props?.hatchWall?.reply.opacity).toBe(0);
    expect(partAt(2600, 'queued').emoteMark?.name).toBe('thinking-dots');
    expect(partAt(2600, 'queued').nearHand).toMatchObject({ centreX: 28, centreY: -26 });
  });

  test('from 2900: the shrug, the right eye height 5, the stub in the hand and the sweat drop', () => {
    const part = partAt(3200, 'queued');
    expect(part.body).toEqual({ leanDegrees: 5, addedLift: 2, heightFactor: 1.03 });
    expect(part.eyes).toEqual({ shift: 6, rightHeightOverride: 5 });
    expect(part.emoteMark?.name).toBe('sweat-drop');
    expect(part.props?.hatchWall?.stub).toEqual({ nearX: 33, centreY: -26, opacity: 1 });
    expect(partAt(3050, 'queued').props?.hatchWall?.stub.opacity).toBeCloseTo(0.5);
  });

  test('after the hand has gone at 3600, the stub stays at the wait place and fades with the wall', () => {
    const part = partAt(4000, 'queued');
    expect(part.nearHand).toBeNull();
    expect(part.props?.hatchWall?.stub).toEqual({ nearX: 33, centreY: -26, opacity: 1 });
    expect(part.props?.hatchWall?.cycleOpacity).toBeCloseTo(0.5);
  });
});

test('two looping intents, each with its variant and still moment', () => {
  expect(HATCH_GESTURE.intents).toEqual({
    'hatch':        { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2600 },
    'hatch-queued': { variant: 'queued', durationMilliseconds: null, stillMomentMilliseconds: 3200 },
  });
  expect(partAt(4400 + 850)).toEqual(partAt(850));
});

test('facing left gives the same part: the renderer mirrors the pose and the anchor of a mark', () => {
  for (const [moment, variant] of [[400, 'normal'], [850, 'normal'], [2550, 'normal'], [3000, 'normal'], [3200, 'queued']] as const) {
    expect(HATCH_GESTURE.targetPose(inputAt(moment, variant, -1))).toEqual(partAt(moment, variant));
  }
});
