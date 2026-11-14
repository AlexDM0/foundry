/** The lightbulb of `01-character.md`, the only part of Flint with gradients; its rays show after a moment of the Idea emote. */
import { markDefinition }     from '../MarkDefinition.ts';
import { SHARED_MARK_ANCHOR } from '../constants/MarkShapes.ts';
import { LIGHTBULB_SHAPE }    from './constants/LightbulbValues.ts';

export interface LightbulbDetails {
  readonly raysOpacity: number;
}

const GLASS_PAINT = Object.freeze({ gradient: LIGHTBULB_SHAPE.GLASS_GRADIENT_ID });
const FITTING_PAINT = Object.freeze({ gradient: LIGHTBULB_SHAPE.FITTING_GRADIENT_ID });

export const LIGHTBULB_MARK = markDefinition({
  name:        'lightbulb',
  anchorX:     SHARED_MARK_ANCHOR.ANCHOR_X_UNITS,
  anchorY:     SHARED_MARK_ANCHOR.ANCHOR_Y_UNITS,
  scale:       SHARED_MARK_ANCHOR.SCALE,
  restDetails: Object.freeze<LightbulbDetails>({ raysOpacity: 0 }),
  gradients:   [
    {
      id:    LIGHTBULB_SHAPE.GLASS_GRADIENT_ID,
      stops: [
        { offset: 0, colour: 'bulbGlassLight' },
        { offset: LIGHTBULB_SHAPE.GLASS_MIDDLE_STOP, colour: 'bulbGlassMiddle' },
        { offset: 1, colour: 'bulbGlassDeep' },
      ],
    },
    {
      id:    LIGHTBULB_SHAPE.FITTING_GRADIENT_ID,
      stops: [
        { offset: 0, colour: 'bulbFittingDark' },
        { offset: LIGHTBULB_SHAPE.FITTING_SHINE_STOP, colour: 'bulbFittingShine' },
        { offset: LIGHTBULB_SHAPE.FITTING_MIDDLE_STOP, colour: 'bulbFittingMiddle' },
        { offset: 1, colour: 'bulbFittingShadow' },
      ],
    },
  ],
  shapesOf: (details: LightbulbDetails) => [
    {
      kind:        'path',
      key:         'rays',
      pathData:    LIGHTBULB_SHAPE.RAYS_PATH,
      fill:        'none',
      stroke:      'bulbRays',
      strokeWidth: LIGHTBULB_SHAPE.RAYS_STROKE_UNITS,
      lineCap:     'round',
      opacity:     details.raysOpacity,
    },
    {
      kind:        'path',
      key:         'glass',
      pathData:    LIGHTBULB_SHAPE.GLASS_PATH,
      fill:        GLASS_PAINT,
      stroke:      'bulbOutline',
      strokeWidth: LIGHTBULB_SHAPE.GLASS_STROKE_UNITS,
      lineJoin:    'round',
    },
    {
      kind:         'rectangle',
      key:          'first-band',
      x:            LIGHTBULB_SHAPE.FIRST_BAND_X_UNITS,
      y:            LIGHTBULB_SHAPE.FIRST_BAND_Y_UNITS,
      width:        LIGHTBULB_SHAPE.FIRST_BAND_WIDTH_UNITS,
      height:       LIGHTBULB_SHAPE.FIRST_BAND_HEIGHT_UNITS,
      cornerRadius: LIGHTBULB_SHAPE.BAND_CORNER_RADIUS_UNITS,
      fill:         FITTING_PAINT,
    },
    {
      kind:         'rectangle',
      key:          'second-band',
      x:            LIGHTBULB_SHAPE.SECOND_BAND_X_UNITS,
      y:            LIGHTBULB_SHAPE.SECOND_BAND_Y_UNITS,
      width:        LIGHTBULB_SHAPE.SECOND_BAND_WIDTH_UNITS,
      height:       LIGHTBULB_SHAPE.SECOND_BAND_HEIGHT_UNITS,
      cornerRadius: LIGHTBULB_SHAPE.BAND_CORNER_RADIUS_UNITS,
      fill:         FITTING_PAINT,
    },
    {
      kind:         'rectangle',
      key:          'contact',
      x:            LIGHTBULB_SHAPE.CONTACT_X_UNITS,
      y:            LIGHTBULB_SHAPE.CONTACT_Y_UNITS,
      width:        LIGHTBULB_SHAPE.CONTACT_WIDTH_UNITS,
      height:       LIGHTBULB_SHAPE.CONTACT_HEIGHT_UNITS,
      cornerRadius: LIGHTBULB_SHAPE.CONTACT_CORNER_RADIUS_UNITS,
      fill:         'bulbContact',
    },
  ],
});
