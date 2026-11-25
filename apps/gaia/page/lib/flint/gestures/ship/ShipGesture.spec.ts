/**
 * Ship. What matters: the block fades in between two pentagons, which lift it with `p²` onto the
 * shelf, placed exactly; on landing the block is 0.85 high for 150 ms and the shelf 1 lower for 100 ms; the far hand goes, the near hand
 * becomes a square that stays by the block's near end, clear of the body, until the salute; the tick shows from 1 s; the salute stands tall
 * from 1.2 to 2 s; happy eyes from 1.7 s; then all goes; one action of 2.4 s whose part does not depend on the facing; and reduced motion
 * holds the salute.
 */
import { expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { SHIP_GESTURE }      from './ShipGesture.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): ReturnType<typeof SHIP_GESTURE.targetPose> {
  const input: GestureInput<'normal'> = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return SHIP_GESTURE.targetPose(input);
}

test('0 to 0.3 s the block fades in at (28, -20) between a near pentagon at (42, -12) and a far one at (28, -12)', () => {
  const part = partAt(150);
  expect(part.props?.shipShelf).toMatchObject({
    sceneOpacity: 0.5, blockX: 28, blockY: -20, tickOpacity: 0
  });
  expect(part.nearHand).toEqual({
    cornerCount: 5, centreX: 42, centreY: -12, radius: 6, turnDegrees: 0, placement: 'exact-position',
  });
  expect(part.farHand).toEqual({
    cornerCount: 5, centreX: 28, centreY: -12, radius: 5.4, turnDegrees: 0, placement: 'exact-position',
  });
  expect(part.body).toEqual({ leanDegrees: 5 });
});

test('0.3 to 0.9 s the hands lift the block to (36, -38), on the shelf, with p²', () => {
  const halfway = partAt(600);
  expect(halfway.props?.shipShelf).toMatchObject({ blockX: 30, blockY: -24.5 });
  expect(halfway.nearHand).toMatchObject({ centreX: 44, centreY: -16.5 });
  expect(partAt(900).props?.shipShelf).toMatchObject({ blockX: 36, blockY: -38 });
});

test('at 0.9 s the block is 0.85 high for 150 ms and the shelf 1 lower for 100 ms', () => {
  expect(partAt(900).props?.shipShelf).toMatchObject({ blockHeightFactor: 0.85, shelfDrop: 1 });
  expect(partAt(1020).props?.shipShelf).toMatchObject({ blockHeightFactor: 0.85, shelfDrop: 0 });
  expect(partAt(1050).props?.shipShelf?.blockHeightFactor).toBe(1);
});

test('0.9 to 1.2 s the far hand goes and the near hand becomes a square; the tick shows from 1 s', () => {
  expect(partAt(950).farHand).toBeNull();
  expect(partAt(950).nearHand).toMatchObject({
    cornerCount: 4, centreX: 50, centreY: -30, radius: 6
  });
  expect(partAt(1150).nearHand).toMatchObject({ centreX: 50, centreY: -30 });
  expect(partAt(990).props?.shipShelf?.tickOpacity).toBe(0);
  expect(partAt(1000).props?.shipShelf?.tickOpacity).toBe(1);
});

test('1.2 to 2 s the salute: a square of 6 turned 20 at (16, -40); lean -3, height × 1.03, eye height 8, eye shift 4', () => {
  const part = partAt(1500);
  expect(part.nearHand).toEqual({
    cornerCount: 4, centreX: 16, centreY: -40, radius: 6, turnDegrees: 20, placement: 'eased',
  });
  expect(part.body).toEqual({ leanDegrees: -3, heightFactor: 1.03 });
  expect(part.eyes).toEqual({ height: 8, shift: 4 });
});

test('happy eyes from 1.7 s; from 2 s the hand goes away and the props fade out', () => {
  expect(partAt(1700).eyes?.happiness).toBe(1);
  expect(partAt(2000).nearHand).toBeNull();
  expect(partAt(2200).props?.shipShelf).toMatchObject({ sceneOpacity: 0.5, tickOpacity: 0.5 });
  expect(partAt(2200).eyes?.happiness).toBe(1);
});

test('facing left gives the same part: the renderer mirrors it and mirrors the tick back', () => {
  for (const moment of [150, 600, 1500, 2200]) expect(partAt(moment, -1)).toEqual(partAt(moment, 1));
});

test('one action of 2.4 s; reduced motion holds the salute beside the shelved block and its tick', () => {
  expect(SHIP_GESTURE.intents).toMatchObject({ ship: { variant: 'normal', durationMilliseconds: 2400, stillMomentMilliseconds: 1500 } });
  const still = partAt(SHIP_GESTURE.intents.ship.stillMomentMilliseconds);
  expect(still.nearHand?.turnDegrees).toBe(20);
  expect(still.props?.shipShelf).toMatchObject({ blockX: 36, blockY: -38, tickOpacity: 1 });
});
