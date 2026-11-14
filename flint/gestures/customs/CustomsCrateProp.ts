/**
 * The crate of Customs (`06-more-animations.md`), with its two open flaps, and the item the hand lifts out of it. It is in front of all,
 * so the hand that reaches in goes behind the front of the crate; the item is drawn behind the crate and in front of the hand, so it is
 * hidden while it is in the crate and seen in the hand once lifted.
 */
import type { Shape }          from '../../drawing/Shape.ts';
import { propDefinition }      from '../../props/PropDefinition.ts';
import { blockShapeOf }        from '../../props/shapes/BlockShape.ts';
import { CUSTOMS_CRATE_SHAPE } from './constants/CustomsValues.ts';

export interface CustomsCrateState {
  readonly shown:        number;
  /** Multiplies the opacity: the fade in and out of the crate within one cycle. */
  readonly cycleOpacity: number;
  readonly itemCentreX:  number;
  readonly itemCentreY:  number;
  readonly itemOpacity:  number;
}

export const CUSTOMS_CRATE_PROP = propDefinition({
  name:   'customsCrate',
  hidden: Object.freeze<CustomsCrateState>({
    shown: 0, cycleOpacity: 1, itemCentreX: 0, itemCentreY: 0, itemOpacity: 0,
  }),
  layer:    'in-front-of-all',
  shapesOf: (state: CustomsCrateState) => ({
    opacity: state.shown * state.cycleOpacity,
    shapes:  [
      blockShapeOf({
        key:         'item',
        state:       'work-in-progress',
        x:           state.itemCentreX - (CUSTOMS_CRATE_SHAPE.ITEM_WIDTH_UNITS / 2),
        y:           state.itemCentreY - (CUSTOMS_CRATE_SHAPE.ITEM_HEIGHT_UNITS / 2),
        widthUnits:  CUSTOMS_CRATE_SHAPE.ITEM_WIDTH_UNITS,
        heightUnits: CUSTOMS_CRATE_SHAPE.ITEM_HEIGHT_UNITS,
        opacity:     state.itemOpacity,
      }),
      {
        kind:        'polygon',
        key:         'crate',
        points:      CUSTOMS_CRATE_SHAPE.POINTS,
        fill:        'hardware',
        stroke:      'graphite',
        strokeWidth: CUSTOMS_CRATE_SHAPE.STROKE_UNITS,
        lineJoin:    'round',
      },
      ...CUSTOMS_CRATE_SHAPE.FLAPS.map((flap, i): Shape => ({
        kind:        'line',
        key:         `flap-${i}`,
        x1:          flap.FROM_X_UNITS,
        y1:          flap.FROM_Y_UNITS,
        x2:          flap.TO_X_UNITS,
        y2:          flap.TO_Y_UNITS,
        stroke:      'graphite',
        strokeWidth: CUSTOMS_CRATE_SHAPE.STROKE_UNITS,
        lineCap:     'round',
      })),
    ],
  }),
});
