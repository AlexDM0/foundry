/** The block of Quiet job (`06-more-animations.md`): a block of the other side, graphite, of 14 by 10. */
import { propDefinition }     from '../../props/PropDefinition.ts';
import { blockShapeOf }       from '../../props/shapes/BlockShape.ts';
import { LISTEN_BLOCK_SHAPE } from './constants/ListenValues.ts';

export interface ListenBlockState {
  readonly shown:   number;
  /** The fade of its entrance. */
  readonly opacity: number;
  /** Positive is down: a tap. */
  readonly drop:    number;
}

export const LISTEN_BLOCK_PROP = propDefinition({
  name:     'listenBlock',
  hidden:   Object.freeze<ListenBlockState>({ shown: 0, opacity: 0, drop: 0 }),
  layer:    'behind-body',
  shapesOf: (state: ListenBlockState) => ({
    opacity: state.shown * state.opacity,
    shapes:  [blockShapeOf({
      key:         'block',
      state:       'other-side',
      x:           LISTEN_BLOCK_SHAPE.X_UNITS,
      y:           LISTEN_BLOCK_SHAPE.Y_UNITS + state.drop,
      widthUnits:  LISTEN_BLOCK_SHAPE.WIDTH_UNITS,
      heightUnits: LISTEN_BLOCK_SHAPE.HEIGHT_UNITS,
    })],
  }),
});
