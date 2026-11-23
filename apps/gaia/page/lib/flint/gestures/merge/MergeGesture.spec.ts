/**
 * The merge gesture. What matters: each phase of the
 * 2.6-second cycle (fade in, the squared press, the widening eyes, the snap with its squash and sparks, the fade out) and that it repeats;
 * the happy eyes show on the frame of the snap with no fade; and the part does not depend on the facing, since the renderer mirrors the
 * tick back and a tick is never mirrored.
 */
import { describe, expect, test } from 'bun:test';

import { poseWithPart }      from '../../PoseComposition.ts';
import { easedPoseOf }       from '../../PoseEasing.ts';
import type { Facing }       from '../../SpriteGeometry.ts';
import type { Pose }         from '../../SpritePose.ts';
import { NEUTRAL_POSE }      from '../../SpritePose.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { MERGE_GESTURE }     from './MergeGesture.ts';

const FRAME_MILLISECONDS = 16;

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

function targetAt(elapsedMilliseconds: number): Pose {
  return poseWithPart(NEUTRAL_POSE, MERGE_GESTURE.targetPose(inputAt(elapsedMilliseconds)));
}

describe('the cycle', () => {
  test('0 to 0.3 s: the two blocks fade in, the top at y -42, the bottom at y -18, pressed by two hexagons', () => {
    const part = MERGE_GESTURE.targetPose(inputAt(150));
    expect(part.props?.mergeBlocks).toMatchObject({
      shown: 1, topBlockY: -42, bottomBlockY: -18, blocksOpacity: 0.5, mergedOpacity: 0, tickOpacity: 0,
    });
    expect(part.nearHand).toEqual({
      cornerCount: 6, centreX: 34, centreY: -49, radius: 6, turnDegrees: 0, placement: 'eased',
    });
    expect(part.farHand).toEqual({
      cornerCount: 6, centreX: 34, centreY: -3, radius: 5.5, turnDegrees: 0, placement: 'eased',
    });
    expect(part.eyes).toEqual({ height: 6, lift: -1, shift: 6 });
    expect(part.body).toEqual({ leanDegrees: 5 });
  });

  test('0.35 to 0.9 s: the press squares, so the blocks move 8 each at its end; the hands follow them', () => {
    const halfway = MERGE_GESTURE.targetPose(inputAt(625));
    expect(halfway.props?.mergeBlocks).toMatchObject({ topBlockY: -40, bottomBlockY: -20 });
    expect(halfway.nearHand?.centreY).toBe(-47);
    expect(halfway.farHand?.centreY).toBe(-5);
  });

  test('0.625 to 0.9 s: the eyes open from 6 to 10 over the second half of the press', () => {
    expect(MERGE_GESTURE.targetPose(inputAt(625)).eyes?.height).toBe(6);
    expect(MERGE_GESTURE.targetPose(inputAt(762.5)).eyes?.height).toBeCloseTo(8);
    expect(MERGE_GESTURE.targetPose(inputAt(899.9)).eyes?.height).toBeCloseTo(10, 1);
  });

  test('at 0.9 s the blocks snap into the merged block with its tick; the happy eyes show; each hand moves 3 away', () => {
    const part = MERGE_GESTURE.targetPose(inputAt(900));
    expect(part.props?.mergeBlocks).toMatchObject({
      blocksOpacity: 0, mergedOpacity: 1, tickOpacity: 1, mergedOffsetX: 0, mergedOffsetY: 0, topBlockY: -34, bottomBlockY: -26,
    });
    expect(part.eyes).toMatchObject({ height: 10, happiness: 1 });
    expect(part.exactFields).toEqual(['happy-eyes']);
    expect(part.nearHand?.centreY).toBe(-44);
    expect(part.farHand?.centreY).toBe(-8);
  });

  test('0.9 to 1.1 s: the body is 1.04 wide and 0.95 high, then back to normal', () => {
    expect(MERGE_GESTURE.targetPose(inputAt(1000)).body).toEqual({ leanDegrees: 5, widthFactor: 1.04, heightFactor: 0.95 });
    expect(MERGE_GESTURE.targetPose(inputAt(1100)).body).toEqual({ leanDegrees: 5 });
  });

  test('0.9 to 1.35 s: four sparks fly out on their ways, turning and fading', () => {
    const sparks = MERGE_GESTURE.targetPose(inputAt(1125)).props?.mergeBlocks?.sparks ?? [];
    expect(sparks).toHaveLength(4);
    const ways = [[-1, -0.5], [1, -0.5], [-1, 0.6], [1, 0.6]];
    sparks.forEach((spark, i) => {
      const [wayX, wayY] = ways[i] ?? [0, 0];
      expect(spark.x).toBeCloseTo(34 + ((wayX ?? 0) * 14));
      expect(spark.y).toBeCloseTo(-26 + ((wayY ?? 0) * 8));
      expect(spark.turnDegrees).toBeCloseTo(90);
      expect(spark.opacity).toBeCloseTo(0.5);
    });
  });

  test('the sparks are not seen before the snap, on its frame, or after their flight', () => {
    for (const moment of [500, 900, 1350, 2000]) {
      expect(MERGE_GESTURE.targetPose(inputAt(moment)).props?.mergeBlocks?.sparks.every((spark) => spark.opacity === 0)).toBe(true);
    }
  });

  test('1.9 to 2.6 s: the merged block and the tick fade out as the block moves by (12, 5), still happy', () => {
    const part = MERGE_GESTURE.targetPose(inputAt(2250));
    expect(part.props?.mergeBlocks).toMatchObject({
      mergedOpacity: 0.5, tickOpacity: 0.5, mergedOffsetX: 6, mergedOffsetY: 2.5
    });
    expect(part.eyes?.happiness).toBe(1);
  });

  test('the cycle repeats every 2.6 s, and the next press starts without the happy eyes', () => {
    expect(MERGE_GESTURE.targetPose(inputAt(2600 + 625))).toEqual(MERGE_GESTURE.targetPose(inputAt(625)));
    expect(MERGE_GESTURE.targetPose(inputAt(2600 + 100)).eyes?.happiness).toBeUndefined();
  });
});

test('the happy eyes show on the frame of the snap, with no fade', () => {
  const beforeSnap = easedPoseOf(NEUTRAL_POSE, targetAt(884), FRAME_MILLISECONDS);
  expect(beforeSnap.eyes.happiness).toBe(0);
  expect(easedPoseOf(beforeSnap, targetAt(900), FRAME_MILLISECONDS).eyes.happiness).toBe(1);
});

test('facing left gives the same part: the renderer mirrors the pose and mirrors the tick back', () => {
  for (const moment of [150, 625, 900, 1125, 2250]) {
    expect(MERGE_GESTURE.targetPose(inputAt(moment, -1))).toEqual(MERGE_GESTURE.targetPose(inputAt(moment, 1)));
  }
});

test('reduced motion holds the merged block with its tick and the happy eyes, with no sparks', () => {
  const part = MERGE_GESTURE.targetPose(inputAt(MERGE_GESTURE.intents.merge.stillMomentMilliseconds));
  expect(part.props?.mergeBlocks).toMatchObject({ mergedOpacity: 1, tickOpacity: 1, blocksOpacity: 0 });
  expect(part.props?.mergeBlocks?.sparks.every((spark) => spark.opacity === 0)).toBe(true);
  expect(part.eyes?.happiness).toBe(1);
});
