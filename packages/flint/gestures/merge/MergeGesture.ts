/**
 * Implements `02-animations.md`, "Gestures", "Merge": two hexagon hands press two blocks into one, which snaps with sparks and a tick.
 * The happy eyes show on the frame of the snap, with no fade. The renderer mirrors the tick back, so the part is the same either facing.
 */
import type { PosePart }                   from '../../SpritePose.ts';
import { EYE_SHAPE }                       from '../../constants/BodyShape.ts';
import { PRESSED_BLOCKS_SHAPE }            from '../../props/shapes/constants/PressedBlocksShape.ts';
import { BlockPressUtil }                  from '../BlockPressUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import { snapSparksAt }                    from '../SnapSparks.ts';
import { BLOCK_PRESS }                     from '../constants/BlockPress.ts';
import { MERGE_TIMELINE }                  from './constants/MergeValues.ts';

/** The press of the two blocks, the snap with its sparks and happy eyes, and the merged block leaving, in each cycle. */
function mergePartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, MERGE_TIMELINE.CYCLE_MILLISECONDS);
  const press = GestureTimelineUtil.progressBetween(timeInCycle, MERGE_TIMELINE.PRESS_STARTS_MILLISECONDS, MERGE_TIMELINE.SNAP_MILLISECONDS);
  const pressed = press * press;
  const isSnapped = timeInCycle >= MERGE_TIMELINE.SNAP_MILLISECONDS;
  const isSquashed = isSnapped && timeInCycle < MERGE_TIMELINE.SQUASH_ENDS_MILLISECONDS;
  const leaving = GestureTimelineUtil.progressBetween(timeInCycle, MERGE_TIMELINE.LEAVES_MILLISECONDS, MERGE_TIMELINE.CYCLE_MILLISECONDS);
  const arriving = GestureTimelineUtil.progressBetween(timeInCycle, 0, MERGE_TIMELINE.FADE_IN_MILLISECONDS);
  const topBlockY = PRESSED_BLOCKS_SHAPE.TOP_BLOCK_Y_UNITS + (BLOCK_PRESS.TRAVEL_UNITS * pressed);
  const bottomBlockY = PRESSED_BLOCKS_SHAPE.BOTTOM_BLOCK_Y_UNITS - (BLOCK_PRESS.TRAVEL_UNITS * pressed);
  const hands = BlockPressUtil.pressingHandsOf(topBlockY, bottomBlockY, isSnapped);
  return {
    body: BlockPressUtil.pressingBodyOf(isSquashed),
    eyes: {
      height: BlockPressUtil.pressingEyeHeightOf(press),
      lift:   BLOCK_PRESS.EYE_LIFT_UNITS,
      shift:  EYE_SHAPE.SHIFT_AT_WORK_UNITS,
      ...(isSnapped ? { happiness: 1 } : {}),
    },
    nearHand: hands.near,
    farHand:  hands.far,
    props:    {
      mergeBlocks: {
        shown:         1,
        topBlockY,
        bottomBlockY,
        blocksOpacity: isSnapped ? 0 : arriving,
        ...BlockPressUtil.snappedBlockOf(isSnapped, leaving),
        sparks:        snapSparksAt(timeInCycle - MERGE_TIMELINE.SNAP_MILLISECONDS),
      },
    },
    ...(isSnapped ? { exactFields: ['happy-eyes'] } : {}),
  };
}

export const MERGE_GESTURE = gestureDefinition({
  name:                  'merge',
  intents:               { merge: singleFormOf(null, MERGE_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            mergePartOf,
});
