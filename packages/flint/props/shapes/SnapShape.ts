/** The snap of two pressed blocks (`01-character.md`, Merge): the merged block, two blocks high, with its tick, and the sparks of the snap. */
import type { Shape }           from '../../drawing/Shape.ts';
import { blockShapeOf }         from './BlockShape.ts';
import type { SmallSparkPlace } from './SparkShapeUtil.ts';
import { SparkShapeUtil }       from './SparkShapeUtil.ts';
import { VerdictShapeUtil }     from './VerdictShapeUtil.ts';
import { PRESSED_BLOCKS_SHAPE } from './constants/PressedBlocksShape.ts';

export interface SnapState {
  readonly mergedOpacity: number;
  readonly mergedOffsetX: number;
  readonly mergedOffsetY: number;
  readonly tickOpacity:   number;
  readonly sparks:        readonly SmallSparkPlace[];
}

/** The tick is never mirrored; the sparks keep the larger side of the snap. */
export function snapShapesOf(state: SnapState): readonly Shape[] {
  return [
    blockShapeOf({
      key:         'merged-block',
      state:       'landed',
      x:           PRESSED_BLOCKS_SHAPE.X_UNITS,
      y:           PRESSED_BLOCKS_SHAPE.MERGED_Y_UNITS,
      heightUnits: PRESSED_BLOCKS_SHAPE.MERGED_HEIGHT_UNITS,
      opacity:     state.mergedOpacity,
      offsetX:     state.mergedOffsetX,
      offsetY:     state.mergedOffsetY,
    }),
    VerdictShapeUtil.tickOf({
      key: 'tick', startX: PRESSED_BLOCKS_SHAPE.TICK_START_X_UNITS, startY: PRESSED_BLOCKS_SHAPE.TICK_START_Y_UNITS, opacity: state.tickOpacity,
    }),
    ...state.sparks.map((spark, i): Shape => SparkShapeUtil.smallSparkOf({ key: `spark-${i}`, ...spark, sideUnits: PRESSED_BLOCKS_SHAPE.SPARK_SIDE_UNITS })),
  ];
}
