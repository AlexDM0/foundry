/**
 * Unplugged. What matters: the props fade in with a pentagon held to the loose plug at
 * (32, -30); the crimson warning blinks 300 ms on, 300 ms off until the plug is in; Flint looks at the plug, then at the socket; the hand
 * becomes a hexagon and pushes the plug to (40, -30), placed exactly; at 2.2 s sparks fly, the slots turn green and the eyes open wide;
 * pulses run down the cable each 500 ms until 3.4 s, with happy eyes from 2.4 s; the props fade; the part does not depend on the facing;
 * the cycle repeats every 4.4 s; and reduced motion holds the plug in with its stream.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { UNPLUGGED_GESTURE } from './UnpluggedGesture.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): ReturnType<typeof UNPLUGGED_GESTURE.targetPose> {
  const input: GestureInput<'normal'> = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return UNPLUGGED_GESTURE.targetPose(input);
}

describe('the cycle', () => {
  test('0 to 0.3 s the props fade in; a pentagon of 6 holds the plug at (32, -30)', () => {
    const part = partAt(150);
    expect(part.props?.unpluggedSocket).toMatchObject({
      sceneOpacity: 0.5, plugX: 32, plugY: -30, isConnected: false, pulseOpacity: 0
    });
    expect(part.nearHand).toEqual({
      cornerCount: 5, centreX: 0, centreY: 0, radius: 6, turnDegrees: 0, placement: { heldTo: 'unpluggedSocket' },
    });
    expect(part.body).toEqual({ leanDegrees: 5 });
  });

  test('the warning shows for 300 ms, then not for 300 ms, in turn, until the plug is in', () => {
    expect([150, 450, 750, 1050, 2000].map((moment) => partAt(moment).props?.unpluggedSocket?.warningOpacity)).toEqual([0.5, 0, 1, 0, 1]);
    expect(partAt(2250).props?.unpluggedSocket?.warningOpacity).toBe(0);
  });

  test('0.3 to 1 s Flint looks at the plug; 1 to 1.5 s at the socket', () => {
    expect(partAt(700).eyes).toEqual({
      shift: 6, height: 6, lift: 1, rightHeightOverride: 5
    });
    expect(partAt(1200).eyes).toEqual({
      shift: 8, height: 6, lift: -1, rightHeightOverride: 5
    });
  });

  test('1.5 to 1.7 s the hand changes to a hexagon of 6; 1.7 to 2.2 s it pushes the plug to (40, -30)', () => {
    expect(partAt(1600).nearHand).toMatchObject({ cornerCount: 6, radius: 6, placement: { heldTo: 'unpluggedSocket' } });
    expect(partAt(1600).props?.unpluggedSocket?.plugX).toBe(32);
    expect(partAt(1950).props?.unpluggedSocket?.plugX).toBe(36);
    expect(partAt(2199).props?.unpluggedSocket?.plugX).toBeCloseTo(40, 1);
  });

  test('at 2.2 s the plug is in: the slots turn green, sparks fly, the eyes open to 10, and the hand goes', () => {
    const part = partAt(2200);
    expect(part.props?.unpluggedSocket).toMatchObject({ plugX: 40, isConnected: true });
    expect(part.eyes).toEqual({ shift: 6, height: 10 });
    expect(part.nearHand).toBeNull();
    const sparks = partAt(2400).props?.unpluggedSocket?.sparks ?? [];
    expect(sparks).toHaveLength(3);
    expect(sparks[0]?.x).toBeCloseTo(46 + (8 * Math.cos(-160 * Math.PI / 180)));
    expect(sparks[0]?.y).toBeCloseTo(-28 + (8 * Math.sin(-160 * Math.PI / 180)));
    expect(sparks[0]).toMatchObject({ turnDegrees: 90, opacity: 0.5 });
    expect(partAt(2200).props?.unpluggedSocket?.sparks.every((spark) => spark.opacity === 0)).toBe(true);
  });

  test('2.2 to 3.4 s a pulse runs down the cable each 500 ms; happy eyes from 2.4 s', () => {
    expect(partAt(2450).props?.unpluggedSocket).toMatchObject({ pulseAlong: 0.5, pulseOpacity: 1 });
    expect(partAt(2950).props?.unpluggedSocket?.pulseAlong).toBe(0.5);
    expect(partAt(3400).props?.unpluggedSocket?.pulseOpacity).toBe(0);
    expect(partAt(2399).eyes?.happiness).toBeUndefined();
    expect(partAt(2400).eyes?.happiness).toBe(1);
  });

  test('3.4 to 4.4 s the props fade out', () => {
    expect(partAt(3900).props?.unpluggedSocket?.sceneOpacity).toBeCloseTo(0.5);
  });

  test('the cycle repeats every 4.4 s', () => {
    for (const moment of [150, 1200, 1950, 2450]) expect(partAt(4400 + moment)).toEqual(partAt(moment));
  });
});

test('facing left gives the same part: the renderer mirrors the plug, the socket and the cable', () => {
  for (const moment of [700, 1950, 2400]) expect(partAt(moment, -1)).toEqual(partAt(moment, 1));
});

test('one intent, a loop; reduced motion holds the plug in, with its stream and the happy eyes', () => {
  expect(UNPLUGGED_GESTURE.intents).toMatchObject({ unplugged: { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2600 } });
  const still = partAt(UNPLUGGED_GESTURE.intents.unplugged.stillMomentMilliseconds);
  expect(still.props?.unpluggedSocket).toMatchObject({ plugX: 40, isConnected: true, pulseOpacity: 1 });
  expect(still.eyes?.happiness).toBe(1);
});
