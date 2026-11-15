/** The block of the shared vocabulary (`06-more-animations.md`): a change, by its state. */
import type { FlintColourRole } from '../../constants/Palette.ts';
import type { Shape }           from '../../drawing/Shape.ts';
import { BLOCK_SHAPE }          from './constants/SharedShapes.ts';

export type BlockState = 'work-in-progress' | 'other-side' | 'landed';

const BLOCK_COLOURS: Readonly<Record<BlockState, FlintColourRole>> = Object.freeze({
  'work-in-progress': 'emberLight',
  'other-side':       'graphite',
  'landed':           'done',
});

export interface BlockOptions {
  readonly key:          string;
  readonly state:        BlockState;
  /** The top left corner. */
  readonly x:            number;
  readonly y:            number;
  /** The block of the vocabulary is 12 by 8; a block in a queue or a crate is smaller, and a merged block two blocks high. */
  readonly widthUnits?:  number;
  readonly heightUnits?: number;
  readonly opacity?:     number;
  readonly offsetX?:     number;
  readonly offsetY?:     number;
}

export function blockShapeOf(options: BlockOptions): Shape {
  const isMoved = (options.offsetX ?? 0) !== 0 || (options.offsetY ?? 0) !== 0;
  return {
    kind:         'rectangle',
    key:          options.key,
    x:            options.x,
    y:            options.y,
    width:        options.widthUnits ?? BLOCK_SHAPE.WIDTH_UNITS,
    height:       options.heightUnits ?? BLOCK_SHAPE.HEIGHT_UNITS,
    cornerRadius: BLOCK_SHAPE.CORNER_RADIUS_UNITS,
    fill:         BLOCK_COLOURS[options.state],
    ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
    ...(isMoved ? { transform: [{ translateX: options.offsetX ?? 0, translateY: options.offsetY ?? 0 }] } : {}),
  };
}
