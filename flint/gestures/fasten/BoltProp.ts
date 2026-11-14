/** The bolt of `01-character.md` that Fasten turns: it slides in from the side away from Flint as it fades in. */
import { propDefinition } from '../../props/PropDefinition.ts';
import { BOLT_SHAPE }     from './constants/FastenValues.ts';

export interface BoltState {
  readonly shown: number;
}

export const BOLT_PROP = propDefinition({
  name:     'bolt',
  hidden:   Object.freeze<BoltState>({ shown: 0 }),
  layer:    'behind-body',
  shapesOf: (state: BoltState) => ({
    shapes: [{
      kind:      'rectangle',
      key:       'bolt',
      x:         BOLT_SHAPE.X_UNITS,
      y:         BOLT_SHAPE.Y_UNITS,
      width:     BOLT_SHAPE.WIDTH_UNITS,
      height:    BOLT_SHAPE.HEIGHT_UNITS,
      fill:      'bolt',
      opacity:   state.shown,
      transform: [{ translateX: (1 - state.shown) * BOLT_SHAPE.SLIDE_UNITS, translateY: 0 }],
    }],
  }),
});
