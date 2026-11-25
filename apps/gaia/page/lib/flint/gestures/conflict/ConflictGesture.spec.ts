/**
 * Conflict. What matters: the first press is Merge's with a shorter travel that ends when the tips of the
 * teeth touch; the hit shakes both blocks for 100 ms, shows the crimson lines at the seam for 300 ms and slants the eyes; the blocks move
 * apart and the hands go; the file makes three full strokes, set exactly, while the top teeth move over by 3 and each stroke drops two
 * shavings; the second press has Merge's travel and the teeth fit, alternating; then Merge's snap and leave. Reduced motion holds 2800.
 * The tick is mirrored back by the renderer, so the part is the same either facing.
 */
import { describe, expect, test } from 'bun:test';

import { poseWithPart }      from '../../PoseComposition.ts';
import { easedPoseOf }       from '../../PoseEasing.ts';
import type { Facing }       from '../../SpriteGeometry.ts';
import type { Pose }         from '../../SpritePose.ts';
import { NEUTRAL_POSE }      from '../../SpritePose.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { CONFLICT_GESTURE }  from './ConflictGesture.ts';

const FRAME_MILLISECONDS = 16;

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => CONFLICT_GESTURE.targetPose(inputAt(elapsedMilliseconds));
const blocksAt = (elapsedMilliseconds: number) => partAt(elapsedMilliseconds).props?.conflictBlocks;
const targetAt = (elapsedMilliseconds: number): Pose => poseWithPart(NEUTRAL_POSE, partAt(elapsedMilliseconds));

describe('the press and the hit', () => {
  test('0 to 300: Merge\'s blocks fade in, pressed by Merge\'s hexagons', () => {
    expect(blocksAt(150)).toMatchObject({ topBlockY: -42, bottomBlockY: -18, blocksOpacity: 0.5 });
    expect(partAt(150).nearHand).toMatchObject({
      cornerCount: 6, centreX: 34, centreY: -49, radius: 6
    });
    expect(partAt(150).farHand).toMatchObject({
      cornerCount: 6, centreX: 34, centreY: -3, radius: 5.5
    });
  });

  test('300 to 700: the press squares, and at its end the tips of the teeth touch', () => {
    expect(blocksAt(500)).toMatchObject({ topBlockY: -40.5, bottomBlockY: -19.5 });
    const atHit = blocksAt(700);
    expect((atHit?.topBlockY ?? 0) + 8 + 2).toBe((atHit?.bottomBlockY ?? 0) - 2);
    expect(atHit?.topTeethX).toEqual([30, 36]);
  });

  test('700: both blocks shake by 0.8 for 100 ms, the crimson lines show at the seam for 300 ms, and the eyes slant 10', () => {
    expect(blocksAt(744)?.blocksShakeX).toBeCloseTo(0.8 * Math.sin(44 / 28));
    expect(blocksAt(800)?.blocksShakeX).toBe(0);
    expect(blocksAt(699)?.impactOpacity).toBe(0);
    expect(blocksAt(700)).toMatchObject({ impactOpacity: 1, seamY: -26 });
    expect(blocksAt(1000)?.impactOpacity).toBe(0);
    expect(partAt(750).eyes?.slantDegrees).toBe(10);
  });

  test('700 to 1000: the blocks move apart to a travel of 2, and the hands go away', () => {
    expect(blocksAt(850)).toMatchObject({ topBlockY: -38, bottomBlockY: -22 });
    expect(blocksAt(1000)).toMatchObject({ topBlockY: -40, bottomBlockY: -20 });
    expect(partAt(750).nearHand).toBeNull();
    expect(partAt(750).farHand).toBeNull();
  });
});

describe('the file', () => {
  test('one triangle of 5.5, turned 90, comes out to (26, -31) before its first stroke', () => {
    expect(partAt(900).nearHand).toEqual({
      cornerCount: 3, centreX: 26, centreY: -31, radius: 5.5, turnDegrees: 90, placement: 'eased',
    });
    expect(partAt(900).farHand).toBeNull();
  });

  test('1000 to 2200: three strokes of 400 ms from x 26 to x 42 and back, set exactly; eye height 5 and the slant', () => {
    expect(partAt(1100).nearHand).toMatchObject({ centreX: 34, centreY: -31, placement: 'exact-position' });
    expect(partAt(1200).nearHand?.centreX).toBe(42);
    expect(partAt(1400).nearHand?.centreX).toBe(26);
    expect(partAt(2000).nearHand?.centreX).toBe(42);
    expect(partAt(1500).eyes).toMatchObject({ height: 5, slantDegrees: 10 });
    const drawn = easedPoseOf(easedPoseOf(NEUTRAL_POSE, targetAt(1084), FRAME_MILLISECONDS), targetAt(1100), FRAME_MILLISECONDS);
    expect(drawn.nearHand?.centreX).toBe(34);
  });

  test('the teeth of the top block move from x 30 and 36 to x 33 and 39 during the strokes', () => {
    expect(blocksAt(1600)?.topTeethX).toEqual([31.5, 37.5]);
    expect(blocksAt(2200)?.topTeethX).toEqual([33, 39]);
  });

  test('each stroke drops two shavings that fall 8 and fade', () => {
    expect(blocksAt(1000)?.shavings).toHaveLength(6);
    const firstBirth = 1000 + (400 * 0.2);
    const falling = blocksAt(firstBirth + 150)?.shavings[0];
    expect(falling?.y).toBeCloseTo(-30 + 2);
    expect(falling?.opacity).toBeCloseTo(0.5);
    expect(blocksAt(firstBirth - 1)?.shavings[0]?.opacity).toBe(0);
    expect(blocksAt(firstBirth + 300)?.shavings[0]?.opacity).toBe(0);
  });
});

describe('the fit and the snap', () => {
  test('2200 to 2600: the hexagons press with Merge\'s travel of 8, and the teeth fit, alternating', () => {
    expect(partAt(2400).nearHand?.cornerCount).toBe(6);
    expect(blocksAt(2400)).toMatchObject({ topBlockY: -38.5, bottomBlockY: -21.5 });
    const toothCentres = [...(blocksAt(2599)?.topTeethX ?? []), 30, 36].sort((a, b) => a - b);
    expect(toothCentres).toEqual([30, 33, 36, 39]);
  });

  test('2600: Merge\'s snap: the merged block and tick, the happy eyes on that frame, the squash and the sparks', () => {
    const part = partAt(2600);
    expect(part.props?.conflictBlocks).toMatchObject({ blocksOpacity: 0, mergedOpacity: 1, tickOpacity: 1 });
    expect(part.eyes?.happiness).toBe(1);
    expect(part.exactFields).toEqual(['happy-eyes']);
    expect(partAt(2700).body).toEqual({ leanDegrees: 5, widthFactor: 1.04, heightFactor: 0.95 });
    expect(partAt(2800).body).toEqual({ leanDegrees: 5 });
    expect(blocksAt(2825)?.sparks.map((spark) => spark.opacity)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  test('3000 to 3600: the merged block leaves as in Merge', () => {
    expect(blocksAt(3300)).toMatchObject({
      mergedOpacity: 0.5, tickOpacity: 0.5, mergedOffsetX: 6, mergedOffsetY: 2.5
    });
  });

  test('the loop repeats every 3600 ms', () => {
    expect(partAt(3600 + 1100)).toEqual(partAt(1100));
  });
});

test('reduced motion holds 2800: the merged block with its tick and the happy eyes', () => {
  expect(CONFLICT_GESTURE.intents.conflict).toMatchObject({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2800 });
  const still = partAt(CONFLICT_GESTURE.intents.conflict.stillMomentMilliseconds);
  expect(still.props?.conflictBlocks).toMatchObject({ mergedOpacity: 1, tickOpacity: 1, blocksOpacity: 0 });
  expect(still.eyes?.happiness).toBe(1);
});

test('facing left gives the same part: the renderer mirrors the pose and mirrors the tick back', () => {
  for (const moment of [500, 744, 1100, 2400, 2825]) {
    expect(CONFLICT_GESTURE.targetPose(inputAt(moment, -1))).toEqual(partAt(moment));
  }
});
