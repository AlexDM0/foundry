/** The keyboard, which typing and the search of research share: it slides up as it fades in, and jolts down. */
import { propDefinition } from '../PropDefinition.ts';
import { KEYBOARD_SHAPE } from './constants/KeyboardValues.ts';

export interface KeyboardState {
  readonly shown: number;
  /** The jolt of angry typing, down. */
  readonly drop:  number;
}

export const KEYBOARD_PROP = propDefinition({
  name:     'keyboard',
  hidden:   Object.freeze<KeyboardState>({ shown: 0, drop: 0 }),
  layer:    'behind-body',
  shapesOf: (state: KeyboardState) => ({
    opacity:   state.shown,
    transform: [{ translateX: 0, translateY: state.drop + ((1 - state.shown) * KEYBOARD_SHAPE.SLIDE_UNITS) }],
    shapes:    [{
      kind:         'rectangle',
      key:          'keyboard',
      x:            KEYBOARD_SHAPE.X_UNITS,
      y:            KEYBOARD_SHAPE.Y_UNITS,
      width:        KEYBOARD_SHAPE.WIDTH_UNITS,
      height:       KEYBOARD_SHAPE.HEIGHT_UNITS,
      cornerRadius: KEYBOARD_SHAPE.CORNER_RADIUS_UNITS,
      fill:         'keyboard',
      stroke:       'graphite',
      strokeWidth:  KEYBOARD_SHAPE.STROKE_UNITS,
      transform:    [{ rotateDegrees: KEYBOARD_SHAPE.TURN_DEGREES, aboutX: KEYBOARD_SHAPE.TURN_CENTRE_X_UNITS, aboutY: KEYBOARD_SHAPE.TURN_CENTRE_Y_UNITS }],
    }],
  }),
});
