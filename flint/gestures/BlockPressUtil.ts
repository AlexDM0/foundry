/**
 * The press of two blocks into one (`02-animations.md`, "Merge"), which every gesture that presses blocks shares: the two hexagons, the
 * widening of the eyes, the squash of the snap, and the merged block that leaves with its tick.
 */
import type { BodyPose, HandPose } from '../SpritePose.ts';
import { BODY_SHAPE }              from '../constants/BodyShape.ts';
import type { SnapState }          from '../props/shapes/SnapShape.ts';
import { AnimationCurveUtil }      from '../utils/AnimationCurveUtil.ts';
import { BLOCK_PRESS }             from './constants/BlockPress.ts';

export interface PressingHands {
  readonly near: HandPose;
  readonly far:  HandPose;
}

export const BlockPressUtil = Object.freeze({
  /** The near hexagon presses the top block down and the far one the bottom block up; after the snap each lets go a little. */
  pressingHandsOf: (topBlockY: number, bottomBlockY: number, isSnapped: boolean): PressingHands => {
    const release = isSnapped ? BLOCK_PRESS.RELEASE_UNITS : 0;
    const hexagon = {
      cornerCount: BLOCK_PRESS.HAND_CORNER_COUNT, centreX: BLOCK_PRESS.CENTRE_X_UNITS, turnDegrees: 0, placement: 'eased',
    } as const;
    return {
      near: { ...hexagon, centreY: topBlockY - BLOCK_PRESS.NEAR_HAND_ABOVE_BLOCK_UNITS - release, radius: BLOCK_PRESS.NEAR_HAND_RADIUS_UNITS },
      far:  { ...hexagon, centreY: bottomBlockY + BLOCK_PRESS.FAR_HAND_BELOW_BLOCK_UNITS + release, radius: BLOCK_PRESS.FAR_HAND_RADIUS_UNITS },
    };
  },

  /** The eye height for a press in progress, from 0 to 1: the eyes widen over its second half. */
  pressingEyeHeightOf: (press: number): number => {
    const widening = AnimationCurveUtil.clamp((press - BLOCK_PRESS.EYES_WIDEN_FROM_PRESS) / (1 - BLOCK_PRESS.EYES_WIDEN_FROM_PRESS));
    return BLOCK_PRESS.EYE_HEIGHT_UNITS + (BLOCK_PRESS.EYE_WIDENING_UNITS * widening);
  },

  /** The working lean, with the squash of the snap while it lasts. */
  pressingBodyOf: (isSquashed: boolean): Partial<BodyPose> => ({
    leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES,
    ...(isSquashed ? { widthFactor: BLOCK_PRESS.SNAP_WIDTH_FACTOR, heightFactor: BLOCK_PRESS.SNAP_HEIGHT_FACTOR } : {}),
  }),

  /** The merged block and its tick: hidden before the snap, then they leave together as `leaving` goes from 0 to 1. */
  snappedBlockOf: (isSnapped: boolean, leaving: number): Omit<SnapState, 'sparks'> => {
    const mergedOpacity = isSnapped ? 1 - leaving : 0;
    return {
      mergedOpacity,
      mergedOffsetX: BLOCK_PRESS.MERGED_LEAVE_X_UNITS * leaving,
      mergedOffsetY: BLOCK_PRESS.MERGED_LEAVE_Y_UNITS * leaving,
      tickOpacity:   mergedOpacity,
    };
  },
});
