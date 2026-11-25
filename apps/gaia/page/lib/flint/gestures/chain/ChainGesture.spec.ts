/**
 * Chain. What matters: the sheets fade in; a hexagon adds link n at 300 + 330n, at the link + (-5, 4),
 * one more turn of 60 degrees for each link, and each link springs in; the hand goes away at 1300; B pulls by (4, 3) × sin(π × p) at 1700
 * and 2200 while the eyes look at it; from 2800 Flint looks at A; from 3300 the props fade; reduced motion holds the made chain at rest.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { PosePart }     from '../../SpritePose.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { CHAIN_GESTURE }     from './ChainGesture.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): PosePart {
  const input: GestureInput = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return CHAIN_GESTURE.targetPose(input);
}

describe('the loop of 3800 ms', () => {
  test('0 to 300: the sheets fade in, with no link and no hand', () => {
    const part = partAt(150);
    expect(part.props?.chainedSheets).toEqual({
      shown: 1, cycleOpacity: 0.5, linkScales: [0, 0, 0], sheetBOffsetX: 0, sheetBOffsetY: 0,
    });
    expect(part.nearHand).toBeNull();
  });

  test('300 to 1300: the hexagon adds each link at the link + (-5, 4), turning 60 degrees more for each', () => {
    expect(partAt(500).nearHand).toEqual({
      cornerCount: 6, centreX: 31, centreY: -30, radius: 5.5, turnDegrees: 60, placement: 'eased',
    });
    expect(partAt(700).nearHand).toMatchObject({ centreX: 34.5, centreY: -25, turnDegrees: 120 });
    expect(partAt(1100).nearHand).toMatchObject({ centreX: 38, centreY: -20, turnDegrees: 180 });
    expect(partAt(500).eyes).toEqual({ shift: 6, height: 5 });
    expect(partAt(500).body).toEqual({ leanDegrees: 5 });
  });

  test('a link shows with the spring of an emote mark from the moment it is added', () => {
    expect(partAt(629).props?.chainedSheets?.linkScales).toEqual([1, 0, 0]);
    const springing = partAt(670).props?.chainedSheets?.linkScales[1] ?? 0;
    expect(springing).toBeGreaterThan(1);
    expect(partAt(1200).props?.chainedSheets?.linkScales).toEqual([1, 1, 1]);
  });

  test('1300 to 1600: the hand goes away', () => {
    expect(partAt(1300).nearHand).toBeNull();
    expect(partAt(1300).farHand).toBeNull();
  });

  test('1600 to 2800: sheet B pulls at 1700 and at 2200 by (4, 3) at the middle of each pull, and Flint looks at it', () => {
    expect(partAt(1650).props?.chainedSheets).toMatchObject({ sheetBOffsetX: 0, sheetBOffsetY: 0 });
    expect(partAt(1850).props?.chainedSheets?.sheetBOffsetX).toBeCloseTo(4);
    expect(partAt(1850).props?.chainedSheets?.sheetBOffsetY).toBeCloseTo(3);
    expect(partAt(2100).props?.chainedSheets?.sheetBOffsetX).toBeCloseTo(0);
    expect(partAt(2350).props?.chainedSheets?.sheetBOffsetX).toBeCloseTo(4);
    expect(partAt(1850).eyes).toEqual({ shift: 7, lift: 2 });
  });

  test('2800 to 3300: Flint looks at sheet A', () => {
    expect(partAt(3000).eyes).toEqual({ shift: 6, lift: -2 });
  });

  test('3300 to 3800: the props fade out', () => {
    expect(partAt(3550).props?.chainedSheets?.cycleOpacity).toBe(0.5);
  });

  test('the loop repeats', () => {
    expect(partAt(3800 + 700)).toEqual(partAt(700));
  });
});

test('reduced motion holds the made chain with sheet B at rest', () => {
  expect(CHAIN_GESTURE.intents.chain).toMatchObject({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2000 });
  const part = partAt(2000);
  expect(part.props?.chainedSheets?.linkScales).toEqual([1, 1, 1]);
  expect(part.props?.chainedSheets?.sheetBOffsetX).toBeCloseTo(0);
  expect(part.nearHand).toBeNull();
});

test('facing left the part is the same: nothing in a chain is read or written', () => {
  expect(partAt(700, -1)).toEqual(partAt(700, 1));
});
