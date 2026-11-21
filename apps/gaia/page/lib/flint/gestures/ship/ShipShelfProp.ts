/**
 * The shelf of Ship (`06-more-animations.md`): a shelf line, the landed block of the shared vocabulary that is lifted onto it, and the
 * tick of the delivery. A squashed block keeps its bottom edge where it was.
 */
import { propDefinition }   from '../../props/PropDefinition.ts';
import { blockShapeOf }     from '../../props/shapes/BlockShape.ts';
import { VerdictShapeUtil } from '../../props/shapes/VerdictShapeUtil.ts';
import { BLOCK_SHAPE }      from '../../props/shapes/constants/SharedShapes.ts';
import { SHIP_SHAPE }       from './constants/ShipValues.ts';

export interface ShipState {
  readonly shown:             number;
  readonly sceneOpacity:      number;
  /** The top left corner of the block at its full height. */
  readonly blockX:            number;
  readonly blockY:            number;
  readonly blockHeightFactor: number;
  readonly shelfDrop:         number;
  readonly tickOpacity:       number;
}

export const SHIP_SHELF_PROP = propDefinition({
  name:   'shipShelf',
  hidden: Object.freeze<ShipState>({
    shown:             0,
    sceneOpacity:      0,
    blockX:            SHIP_SHAPE.START_X_UNITS,
    blockY:            SHIP_SHAPE.START_Y_UNITS,
    blockHeightFactor: 1,
    shelfDrop:         0,
    tickOpacity:       0,
  }),
  layer:    'in-front-of-body',
  shapesOf: (state: ShipState) => {
    const blockHeight = BLOCK_SHAPE.HEIGHT_UNITS * state.blockHeightFactor;
    return {
      opacity: state.shown,
      shapes:  [
        {
          kind:        'line',
          key:         'shelf',
          x1:          SHIP_SHAPE.SHELF_START_X_UNITS,
          y1:          SHIP_SHAPE.SHELF_Y_UNITS + state.shelfDrop,
          x2:          SHIP_SHAPE.SHELF_END_X_UNITS,
          y2:          SHIP_SHAPE.SHELF_Y_UNITS + state.shelfDrop,
          stroke:      'graphite',
          strokeWidth: SHIP_SHAPE.SHELF_STROKE_UNITS,
          lineCap:     'round',
          opacity:     state.sceneOpacity,
        },
        blockShapeOf({
          key:         'block',
          state:       'landed',
          x:           state.blockX,
          y:           state.blockY + BLOCK_SHAPE.HEIGHT_UNITS - blockHeight,
          heightUnits: blockHeight,
          opacity:     state.sceneOpacity,
        }),
        VerdictShapeUtil.tickOf({
          key: 'tick', startX: SHIP_SHAPE.TICK_START_X_UNITS, startY: SHIP_SHAPE.TICK_START_Y_UNITS, opacity: state.tickOpacity,
        }),
      ],
    };
  },
});
