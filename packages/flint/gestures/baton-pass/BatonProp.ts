/**
 * The baton of Baton pass (`06-more-animations.md`): a light bar with a band in the body colour at each end, over a soft glow, placed by
 * its centre and turned around it. The bands are the rounded bar itself, with the light middle drawn over it, so the ends stay round.
 */
import { propDefinition } from '../../props/PropDefinition.ts';
import { BATON_SHAPE }    from './constants/BatonPassValues.ts';

export interface BatonState {
  readonly shown:        number;
  /** Multiplies the opacity: the fade at the end of the action. */
  readonly cycleOpacity: number;
  readonly centreX:      number;
  readonly centreY:      number;
  readonly turnDegrees:  number;
}

export const BATON_PROP = propDefinition({
  name:   'baton',
  hidden: Object.freeze<BatonState>({
    shown: 0, cycleOpacity: 1, centreX: 0, centreY: 0, turnDegrees: 0,
  }),
  layer:    'in-front-of-body',
  shapesOf: (state: BatonState) => {
    const halfWidth = BATON_SHAPE.WIDTH_UNITS / 2;
    const halfHeight = BATON_SHAPE.HEIGHT_UNITS / 2;
    return {
      opacity:   state.shown * state.cycleOpacity,
      transform: [{ translateX: state.centreX, translateY: state.centreY }, { rotateDegrees: state.turnDegrees }],
      shapes:    [
        {
          kind: 'circle', key: 'glow', centreX: 0, centreY: 0, radius: BATON_SHAPE.GLOW_RADIUS_UNITS, fill: 'glow', opacity: BATON_SHAPE.GLOW_OPACITY,
        },
        {
          kind:         'rectangle',
          key:          'bands',
          x:            -halfWidth,
          y:            -halfHeight,
          width:        BATON_SHAPE.WIDTH_UNITS,
          height:       BATON_SHAPE.HEIGHT_UNITS,
          cornerRadius: BATON_SHAPE.CORNER_RADIUS_UNITS,
          fill:         'body',
        },
        {
          kind:   'rectangle',
          key:    'bar',
          x:      -halfWidth,
          y:      BATON_SHAPE.BAND_HEIGHT_UNITS - halfHeight,
          width:  BATON_SHAPE.WIDTH_UNITS,
          height: BATON_SHAPE.HEIGHT_UNITS - (2 * BATON_SHAPE.BAND_HEIGHT_UNITS),
          fill:   'emberLight',
        },
      ],
    };
  },
});
