/**
 * The blocks of Conflict (`06-more-animations.md`): Merge's two blocks with two teeth each on the edges that face, drawn over the blocks so
 * that teeth that fit show inside the other block; the crimson lines of the hit; the shavings of the file; and Merge's merged block, tick
 * and sparks. The tick is never mirrored.
 */
import type { Shape }                                               from '../../drawing/Shape.ts';
import { propDefinition }                                           from '../../props/PropDefinition.ts';
import { blockShapeOf }                                             from '../../props/shapes/BlockShape.ts';
import { snapShapesOf }                                             from '../../props/shapes/SnapShape.ts';
import type { SnapState }                                           from '../../props/shapes/SnapShape.ts';
import { PRESSED_BLOCKS_SHAPE }                                     from '../../props/shapes/constants/PressedBlocksShape.ts';
import { BLOCK_SHAPE }                                              from '../../props/shapes/constants/SharedShapes.ts';
import { CONFLICT_IMPACT_LINES, CONFLICT_SHAVINGS, CONFLICT_TEETH } from './constants/ConflictValues.ts';

export interface ConflictShavingState {
  readonly x:       number;
  readonly y:       number;
  readonly opacity: number;
}

export interface ConflictBlocksState extends SnapState {
  readonly shown:         number;
  readonly topBlockY:     number;
  readonly bottomBlockY:  number;
  /** The sideways shake of both blocks at the hit. */
  readonly blocksShakeX:  number;
  readonly topTeethX:     readonly number[];
  readonly blocksOpacity: number;
  /** The y of the seam where the tips of the teeth meet, and the opacity of the crimson lines at its sides. */
  readonly seamY:         number;
  readonly impactOpacity: number;
  readonly shavings:      readonly ConflictShavingState[];
}

function toothOf(key: string, centreX: number, top: number, fill: 'emberLight' | 'graphite', state: ConflictBlocksState): Shape {
  return {
    kind:    'rectangle',
    key,
    x:       centreX - (CONFLICT_TEETH.WIDTH_UNITS / 2) + state.blocksShakeX,
    y:       top,
    width:   CONFLICT_TEETH.WIDTH_UNITS,
    height:  CONFLICT_TEETH.HEIGHT_UNITS,
    fill,
    opacity: state.blocksOpacity,
  };
}

function blocksWithTeethOf(state: ConflictBlocksState): readonly Shape[] {
  const topEdgeY = state.topBlockY + BLOCK_SHAPE.HEIGHT_UNITS;
  return [
    blockShapeOf({
      key: 'top-block', state: 'work-in-progress', x: PRESSED_BLOCKS_SHAPE.X_UNITS + state.blocksShakeX, y: state.topBlockY, opacity: state.blocksOpacity,
    }),
    blockShapeOf({
      key: 'bottom-block', state: 'other-side', x: PRESSED_BLOCKS_SHAPE.X_UNITS + state.blocksShakeX, y: state.bottomBlockY, opacity: state.blocksOpacity,
    }),
    ...state.topTeethX.map((toothX, i) => toothOf(`top-tooth-${i}`, toothX, topEdgeY, 'emberLight', state)),
    ...CONFLICT_TEETH.BOTTOM_X_UNITS.map((toothX, i) => toothOf(`bottom-tooth-${i}`, toothX, state.bottomBlockY - CONFLICT_TEETH.HEIGHT_UNITS, 'graphite', state)),
  ];
}

function impactLinesOf(state: ConflictBlocksState): readonly Shape[] {
  const ends = [
    [CONFLICT_IMPACT_LINES.LEFT_START_X_UNITS, CONFLICT_IMPACT_LINES.LEFT_START_X_UNITS - CONFLICT_IMPACT_LINES.LENGTH_UNITS],
    [CONFLICT_IMPACT_LINES.RIGHT_START_X_UNITS, CONFLICT_IMPACT_LINES.RIGHT_START_X_UNITS + CONFLICT_IMPACT_LINES.LENGTH_UNITS],
  ] as const;
  return ends.map(([fromX, toX], i): Shape => ({
    kind:        'line',
    key:         `impact-${i}`,
    x1:          fromX,
    y1:          state.seamY,
    x2:          toX,
    y2:          state.seamY,
    stroke:      'alarm',
    strokeWidth: CONFLICT_IMPACT_LINES.STROKE_UNITS,
    lineCap:     'round',
    opacity:     state.impactOpacity,
  }));
}

function shavingOf(shaving: ConflictShavingState, i: number): Shape {
  const half = CONFLICT_SHAVINGS.SIDE_UNITS / 2;
  return {
    kind:    'rectangle',
    key:     `shaving-${i}`,
    x:       shaving.x - half,
    y:       shaving.y - half,
    width:   CONFLICT_SHAVINGS.SIDE_UNITS,
    height:  CONFLICT_SHAVINGS.SIDE_UNITS,
    fill:    'emberLight',
    opacity: shaving.opacity,
  };
}

export const CONFLICT_BLOCKS_PROP = propDefinition({
  name:   'conflictBlocks',
  hidden: Object.freeze<ConflictBlocksState>({
    shown:         0,
    topBlockY:     PRESSED_BLOCKS_SHAPE.TOP_BLOCK_Y_UNITS,
    bottomBlockY:  PRESSED_BLOCKS_SHAPE.BOTTOM_BLOCK_Y_UNITS,
    blocksShakeX:  0,
    topTeethX:     CONFLICT_TEETH.TOP_START_X_UNITS,
    blocksOpacity: 0,
    seamY:         0,
    impactOpacity: 0,
    shavings:      Object.freeze([]),
    mergedOpacity: 0,
    mergedOffsetX: 0,
    mergedOffsetY: 0,
    tickOpacity:   0,
    sparks:        Object.freeze([]),
  }),
  layer:    'behind-body',
  shapesOf: (state: ConflictBlocksState) => ({
    opacity: state.shown,
    shapes:  [
      ...blocksWithTeethOf(state),
      ...impactLinesOf(state),
      ...state.shavings.map(shavingOf),
      ...snapShapesOf(state),
    ],
  }),
});
