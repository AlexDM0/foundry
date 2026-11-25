/**
 * Reorder. What matters: the stack fades in; the pentagon reaches the right end of the third card at (50,
 * -25.5); from 800 the hand is held to the card while it is pulled its whole width, 18, out so it clears the stack before it rises, lifted
 * to y -49 as the two cards above go 7 down, and pushed in on top at (30, -42); the eyes follow it up from lift 0 to -3; happy eyes from
 * 2100 and no hand from 2000; the stack fades from 2700; reduced motion holds the card on top.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { PosePart }     from '../../SpritePose.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { REORDER_GESTURE }   from './ReorderGesture.ts';
import { movedCardGripOf }   from './ReorderStackProp.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): PosePart {
  const input: GestureInput = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return REORDER_GESTURE.targetPose(input);
}

describe('the loop of 3600 ms', () => {
  test('0 to 300: the stack fades in, with no hand', () => {
    expect(partAt(150).props?.reorderStack).toEqual({
      shown: 1, cycleOpacity: 0.5, movedCardX: 30, movedCardY: -28, cardsAboveDrop: 0,
    });
    expect(partAt(150).nearHand).toBeNull();
  });

  test('300 to 800: the pentagon goes to the right end of the third card', () => {
    expect(partAt(500).nearHand).toEqual({
      cornerCount: 5, centreX: 50, centreY: -25.5, radius: 5.5, turnDegrees: 0, placement: 'eased',
    });
  });

  test('800 to 1200: the card is pulled 18 units out to the right, clear of the stack, with the hand held to it', () => {
    const part = partAt(1000);
    expect(part.props?.reorderStack).toMatchObject({ movedCardX: 39, movedCardY: -28 });
    expect(partAt(1200).props?.reorderStack?.movedCardX).toBe(30 + 18);
    expect(part.nearHand?.placement).toEqual({ heldTo: 'reorderStack' });
  });

  test('1200 to 1700: the card is lifted to y -49 while the first two cards go 7 down, and the eyes look up', () => {
    const part = partAt(1450);
    expect(part.props?.reorderStack).toMatchObject({ movedCardX: 48, movedCardY: -38.5, cardsAboveDrop: 3.5 });
    expect(part.eyes?.lift).toBe(-1.5);
    expect(partAt(1700).props?.reorderStack).toMatchObject({ movedCardY: -49, cardsAboveDrop: 7 });
  });

  test('1700 to 2000: the card is pushed in on top, to (30, -42)', () => {
    expect(partAt(1850).props?.reorderStack).toMatchObject({ movedCardX: 39, movedCardY: -45.5 });
    expect(partAt(1999).nearHand?.placement).toEqual({ heldTo: 'reorderStack' });
    expect(partAt(2000).props?.reorderStack).toMatchObject({ movedCardX: 30, movedCardY: -42, cardsAboveDrop: 7 });
  });

  test('2000 to 2700: the hand goes away, and the happy eyes show from 2100', () => {
    expect(partAt(2000).nearHand).toBeNull();
    expect(partAt(2050).eyes?.happiness).toBeUndefined();
    expect(partAt(2100).eyes).toEqual({
      shift: 6, height: 6, lift: -3, happiness: 1
    });
  });

  test('2700 to 3600: the stack fades out', () => {
    expect(partAt(3150).props?.reorderStack?.cycleOpacity).toBe(0.5);
    expect(partAt(3150).eyes?.happiness).toBeUndefined();
  });

  test('the hand\'s place is the card\'s grip on every frame it holds the card', () => {
    for (const moment of [800, 1000, 1450, 1850]) {
      const part = partAt(moment);
      const card = part.props?.reorderStack;
      const grip = card === undefined ? null : movedCardGripOf(card);
      expect(part.nearHand?.centreX).toBe(grip?.x);
      expect(part.nearHand?.centreY).toBe(grip?.y);
    }
  });

  test('the loop repeats', () => {
    expect(partAt(3600 + 1450)).toEqual(partAt(1450));
  });
});

test('reduced motion holds the card on top of the stack with the happy eyes', () => {
  expect(REORDER_GESTURE.intents.reorder).toMatchObject({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2200 });
  expect(partAt(2200).props?.reorderStack).toMatchObject({ movedCardX: 30, movedCardY: -42 });
  expect(partAt(2200).eyes?.happiness).toBe(1);
});

test('facing left the part is the same: the stack mirrors with Flint', () => {
  expect(partAt(1450, -1)).toEqual(partAt(1450, 1));
});
