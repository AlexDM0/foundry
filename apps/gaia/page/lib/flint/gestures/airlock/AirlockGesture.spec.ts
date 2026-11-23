/**
 * Airlock. What matters: each phase of the 4800 ms loop (the left door, the block entering while the queue
 * moves up, the hexagon that turns the chamber while the block lands, the right door, the block onto the main line, the happy eyes, the
 * fade of the landed block while a new block joins the queue); the eyes follow the block from 4 to 7; the props fade in only at the very
 * start, and the blocks the loop ends with stand where the next loop starts, so the loop has no break. Reduced motion holds 1800. Nothing
 * in it is read or written, so the part is the same either facing.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }          from '../../SpriteGeometry.ts';
import type { GestureInput }    from '../GestureDefinition.ts';
import { AIRLOCK_CHAMBER_PROP } from './AirlockChamberProp.ts';
import { AIRLOCK_GESTURE }      from './AirlockGesture.ts';

const CYCLE_MILLISECONDS = 4800;

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => AIRLOCK_GESTURE.targetPose(inputAt(elapsedMilliseconds));
const chamberAt = (elapsedMilliseconds: number) => partAt(elapsedMilliseconds).props?.airlockChamber;

describe('the loop', () => {
  test('0 to 300: the props fade in, only in the first loop', () => {
    expect(chamberAt(150)?.introOpacity).toBeCloseTo(0.5);
    expect(chamberAt(CYCLE_MILLISECONDS + 150)?.introOpacity).toBe(1);
  });

  test('300 to 700: the left door opens; 1200 to 1500 it closes', () => {
    expect(chamberAt(500)?.doorOpenings).toEqual([0.5, 0]);
    expect(chamberAt(1000)?.doorOpenings).toEqual([1, 0]);
    expect(chamberAt(1350)?.doorOpenings[0]).toBeCloseTo(0.5);
    expect(chamberAt(1500)?.doorOpenings).toEqual([0, 0]);
  });

  test('700 to 1200: the front block moves to (39.5, -25) in the chamber, and the others move 7 down', () => {
    expect(chamberAt(950)).toMatchObject({ travellerX: 31.75, travellerY: -28.5, queueDrop: 3.5 });
    expect(chamberAt(1200)).toMatchObject({ travellerX: 39.5, travellerY: -25, queueDrop: 7 });
  });

  test('1500 to 2100: one hexagon of 6 at (43, -40) turns 120 degrees while the block lands', () => {
    expect(partAt(1400).nearHand).toBeNull();
    expect(partAt(1800).nearHand).toEqual({
      cornerCount: 6, centreX: 43, centreY: -40, radius: 6, turnDegrees: 60, placement: 'eased',
    });
    expect(chamberAt(1800)?.travellerLanded).toBeCloseTo(0.5);
    expect(chamberAt(2100)?.travellerLanded).toBe(1);
  });

  test('2100 to 2500 the right door opens; 2500 to 3100 the block moves to (52, -25) on the main line', () => {
    expect(chamberAt(2300)?.doorOpenings).toEqual([0, 0.5]);
    expect(chamberAt(2800)).toMatchObject({ travellerX: 45.75, travellerY: -25 });
    expect(chamberAt(3100)).toMatchObject({ travellerX: 52, travellerY: -25 });
  });

  test('3100 to 3600: the happy eyes, and the hand goes away; 3600 to 4000 the right door closes', () => {
    expect(partAt(3099).nearHand).not.toBeNull();
    expect(partAt(3300).nearHand).toBeNull();
    expect(partAt(3300).eyes?.happiness).toBe(1);
    expect(partAt(3700).eyes?.happiness).toBeUndefined();
    expect(chamberAt(3800)?.doorOpenings[1]).toBeCloseTo(0.5);
  });

  test('4000 to 4800: the landed block fades out and a new block fades in at the back of the queue', () => {
    expect(chamberAt(4400)).toMatchObject({ travellerOpacity: 0.5, newcomerOpacity: 0.5 });
  });

  test('the blocks the loop ends with stand where the next loop starts', () => {
    const blocksAt = (elapsedMilliseconds: number) => {
      const chamber = chamberAt(elapsedMilliseconds) ?? AIRLOCK_CHAMBER_PROP.hidden;
      return AIRLOCK_CHAMBER_PROP.shapesOf(chamber, { facing: 1, holdingHand: null }).shapes
        .filter((shape) => shape.kind === 'rectangle' && shape.key !== 'chamber' && (shape.opacity ?? 1) > 0.99 && shape.height > 0)
        .map((shape) => (shape.kind === 'rectangle' ? `${shape.x},${shape.y},${shape.fill}` : ''))
        .sort();
    };
    expect(blocksAt(CYCLE_MILLISECONDS - 0.001)).toEqual(blocksAt(CYCLE_MILLISECONDS));
  });
});

test('the eyes follow the block, from an eye shift of 4 to 7; eye height 6 and lean 5', () => {
  expect(partAt(500).eyes).toEqual({ shift: 4, height: 6 });
  expect(partAt(950).eyes?.shift).toBeCloseTo(4 + (3 * (7.75 / 28)));
  expect(partAt(3100).eyes?.shift).toBe(7);
  expect(partAt(500).body).toEqual({ leanDegrees: 5 });
});

test('reduced motion holds 1800: both doors closed, the hand turning the chamber, the block landing', () => {
  expect(AIRLOCK_GESTURE.intents.airlock).toEqual({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 1800 });
  const still = partAt(AIRLOCK_GESTURE.intents.airlock.stillMomentMilliseconds);
  expect(still.nearHand?.cornerCount).toBe(6);
  expect(still.props?.airlockChamber?.doorOpenings).toEqual([0, 0]);
  expect(still.props?.airlockChamber).toMatchObject({ travellerX: 39.5, travellerY: -25 });
});

test('facing left gives the same part: the renderer mirrors the pose, and nothing in it is read or written', () => {
  for (const moment of [500, 950, 1800, 2800, 4400]) {
    expect(AIRLOCK_GESTURE.targetPose(inputAt(moment, -1))).toEqual(partAt(moment));
  }
});
