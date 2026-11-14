/**
 * The one ember of Bank the fire: ember 2 of Sleep, in its colour, with a smaller side. As Sleep's embers, it is never mirrored and turns
 * around its own corner; a prop is drawn in the mirrored figure, so it is mirrored back about x 0 and its place given as on the screen.
 */
import { EMBER_SHAPES }   from '../../constants/SleepMotion.ts';
import { propDefinition } from '../../props/PropDefinition.ts';
import { BANKED_EMBER }   from './constants/BankFireValues.ts';

/** One ember of Sleep, as `embersOf` gives it; a prop cannot import the pose, which is built from the prop catalog. */
interface RisingEmber {
  readonly x:           number;
  readonly y:           number;
  readonly turnDegrees: number;
  readonly opacity:     number;
}

export interface BankedEmberState {
  readonly shown: number;
  /** Relative to the bottom tip, as on the screen for Flint facing right, whatever the facing. */
  readonly ember: RisingEmber;
}

export const BANKED_EMBER_PROP = propDefinition({
  name:   'bankedEmber',
  hidden: Object.freeze<BankedEmberState>({
    shown: 0,
    ember: Object.freeze({
      x: 0, y: 0, turnDegrees: 0, opacity: 0,
    }),
  }),
  layer:    'behind-body',
  shapesOf: (state: BankedEmberState) => ({
    opacity: state.shown,
    shapes:  [{
      kind:             'rectangle',
      key:              'ember',
      x:                0,
      y:                0,
      width:            BANKED_EMBER.SIDE_UNITS,
      height:           BANKED_EMBER.SIDE_UNITS,
      fill:             EMBER_SHAPES[BANKED_EMBER.EMBER_INDEX].COLOUR,
      opacity:          state.ember.opacity,
      unmirroredAboutX: 0,
      transform:        [{ translateX: state.ember.x, translateY: state.ember.y }, { rotateDegrees: state.ember.turnDegrees }],
    }],
  }),
});
