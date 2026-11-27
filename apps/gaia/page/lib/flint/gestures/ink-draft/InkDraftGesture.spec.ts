/**
 * Ink the draft: the pen traces the outline with the eyes on its tip, the inked sheet pops and gets its header, and the ticket leaves.
 * Facing left the mirrored pen stays on the sheet's side of the edge.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }             from '../../SpriteGeometry.ts';
import type { PosePart }           from '../../SpritePose.ts';
import type { GestureInput }       from '../GestureDefinition.ts';
import { INK_DRAFT_GESTURE }       from './InkDraftGesture.ts';
import type { InkDraftSheetState } from './InkDraftSheetProp.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): PosePart {
  const input: GestureInput = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return INK_DRAFT_GESTURE.targetPose(input);
}

function sheetAt(elapsedMilliseconds: number): InkDraftSheetState | undefined {
  return partAt(elapsedMilliseconds).props?.inkDraftSheet;
}

describe('the loop of 4200 ms', () => {
  test('0 to 300: the draft fades in, and the pen waits at the top left corner', () => {
    expect(sheetAt(150)).toMatchObject({
      cycleOpacity: 0.5, isInked: false, tracedPoints: [{ x: 28, y: -46 }], headerOpacity: 0
    });
    expect(partAt(150).nearHand).toEqual({
      cornerCount: 3, centreX: 31, centreY: -41, radius: 5.5, turnDegrees: -35, placement: 'eased',
    });
  });

  test('300 to 800: the pen goes along the top edge; the outline behind it is traced, and the eyes look up at its tip, held at -3', () => {
    expect(sheetAt(550)?.tracedPoints).toEqual([{ x: 28, y: -46 }, { x: 38, y: -44 }]);
    const part = partAt(550);
    expect(part.nearHand).toMatchObject({ centreX: 41, centreY: -39 });
    expect(part.eyes).toEqual({ shift: 6, height: 6, lift: -3 });
    expect(part.body).toEqual({ leanDegrees: 5 });
  });

  test('800 to 1400: down the far edge in 600 ms, the eyes following the tip down', () => {
    expect(sheetAt(1100)?.tracedPoints).toEqual([{ x: 28, y: -46 }, { x: 48, y: -42 }, { x: 48, y: -26 }]);
    expect(partAt(1100).eyes?.lift).toBeCloseTo(0.4);
  });

  test('1400 to 2300: along the bottom edge in 500 ms and back up in 400 ms, the lift held at 3 at the lowest corner', () => {
    expect(partAt(1400).eyes?.lift).toBe(3);
    expect(sheetAt(1900)?.tracedPoints.at(-1)).toEqual({ x: 28, y: -14 });
    expect(partAt(1900).eyes?.lift).toBeCloseTo(2.8);
    expect(sheetAt(2100)?.tracedPoints.at(-1)).toEqual({ x: 28, y: -30 });
  });

  test('at 2300 the sheet is inked, the outline closed, and it pops to 1.05 for 100 ms', () => {
    const sheet = sheetAt(2300);
    expect(sheet).toMatchObject({ isInked: true, scale: 1.05, headerOpacity: 0 });
    expect(sheet?.tracedPoints).toEqual([{ x: 28, y: -46 }, { x: 48, y: -42 }, { x: 48, y: -10 }, { x: 28, y: -14 }, { x: 28, y: -46 }]);
    expect(sheetAt(2400)?.scale).toBe(1);
  });

  test('2300 to 2700: the two sparks fly from the top corners, and the header fades in to 2600', () => {
    expect(sheetAt(2500)?.sparkFlight).toBe(0.5);
    expect(sheetAt(2450)?.headerOpacity).toBeCloseTo(0.5);
    expect(sheetAt(2600)?.headerOpacity).toBe(1);
  });

  test('2400 to 3300: happy eyes, and the hand goes away', () => {
    expect(partAt(2399).nearHand).not.toBeNull();
    const part = partAt(2400);
    expect(part.nearHand).toBeNull();
    expect(part.eyes?.happiness).toBe(1);
    expect(partAt(3300).eyes?.happiness).toBeUndefined();
  });

  test('3300 to 4200: the ticket moves by (14, -6) and fades out', () => {
    expect(sheetAt(3750)).toMatchObject({
      offsetX: 7, offsetY: -3, cycleOpacity: 0.5, isInked: true
    });
  });

  test('the loop repeats', () => {
    expect(partAt(4200 + 1100)).toEqual(partAt(1100));
  });
});

test('reduced motion holds the ready ticket with its header, the happy eyes and no hand', () => {
  const stillMoment = INK_DRAFT_GESTURE.intents['ink-draft'].stillMomentMilliseconds;
  expect(stillMoment).toBe(2700);
  expect(INK_DRAFT_GESTURE.intents['ink-draft'].durationMilliseconds).toBeNull();
  expect(sheetAt(stillMoment)).toMatchObject({
    isInked: true, headerOpacity: 1, scale: 1, offsetX: 0
  });
  expect(partAt(stillMoment).nearHand).toBeNull();
  expect(partAt(stillMoment).eyes?.happiness).toBe(1);
});

test('facing left the part is the same: the pen keeps its place in Flint\'s own units, on the sheet along the edge nearest the body', () => {
  expect(partAt(550, -1)).toEqual(partAt(550, 1));
  const climbingTheNearEdge = partAt(2100, -1).nearHand;
  expect(climbingTheNearEdge?.centreX).toBeGreaterThan(28);
});
