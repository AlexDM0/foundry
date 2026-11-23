/**
 * The blocks of Merge: two blocks that the hands press together, the merged block they snap into with its tick, and
 * the sparks of the snap. The tick is never mirrored.
 */
import { propDefinition }       from '../../props/PropDefinition.ts';
import { blockShapeOf }         from '../../props/shapes/BlockShape.ts';
import { snapShapesOf }         from '../../props/shapes/SnapShape.ts';
import type { SnapState }       from '../../props/shapes/SnapShape.ts';
import { PRESSED_BLOCKS_SHAPE } from '../../props/shapes/constants/PressedBlocksShape.ts';

export interface MergeBlocksState extends SnapState {
  readonly shown:         number;
  readonly topBlockY:     number;
  readonly bottomBlockY:  number;
  readonly blocksOpacity: number;
}

export const MERGE_BLOCKS_PROP = propDefinition({
  name:   'mergeBlocks',
  hidden: Object.freeze<MergeBlocksState>({
    shown:         0,
    topBlockY:     PRESSED_BLOCKS_SHAPE.TOP_BLOCK_Y_UNITS,
    bottomBlockY:  PRESSED_BLOCKS_SHAPE.BOTTOM_BLOCK_Y_UNITS,
    blocksOpacity: 0,
    mergedOpacity: 0,
    mergedOffsetX: 0,
    mergedOffsetY: 0,
    tickOpacity:   0,
    sparks:        Object.freeze([]),
  }),
  layer:    'behind-body',
  shapesOf: (state: MergeBlocksState) => ({
    opacity: state.shown,
    shapes:  [
      blockShapeOf({
        key: 'top-block', state: 'work-in-progress', x: PRESSED_BLOCKS_SHAPE.X_UNITS, y: state.topBlockY, opacity: state.blocksOpacity,
      }),
      blockShapeOf({
        key: 'bottom-block', state: 'other-side', x: PRESSED_BLOCKS_SHAPE.X_UNITS, y: state.bottomBlockY, opacity: state.blocksOpacity,
      }),
      ...snapShapesOf(state),
    ],
  }),
});
