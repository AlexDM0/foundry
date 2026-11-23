/**
 * The bar of Lay the bar: a faint row line under Flint, and a rounded bar behind it that grows away from Flint.
 * The end of the bar nearest Flint is the fresh part, in the body colour, rounded on the side that faces Flint.
 */
import type { Shape }     from '../../drawing/Shape.ts';
import { SvgTextUtil }    from '../../drawing/SvgTextUtil.ts';
import { propDefinition } from '../../props/PropDefinition.ts';
import { LAY_BAR_SHAPE }  from './constants/LayBarValues.ts';

export interface LayBarState {
  readonly shown:      number;
  readonly barLength:  number;
  readonly barOpacity: number;
}

/** The head: flat where it meets the rest of the bar, a half circle at the end nearest Flint. */
function barHeadOf(opacity: number): Shape {
  const { numberText } = SvgTextUtil;
  const radius = LAY_BAR_SHAPE.BAR_HEIGHT_UNITS / 2;
  const headStartX = LAY_BAR_SHAPE.BAR_END_X_UNITS - LAY_BAR_SHAPE.BAR_HEAD_LENGTH_UNITS;
  const arcStartX = LAY_BAR_SHAPE.BAR_END_X_UNITS - radius;
  const bottomY = LAY_BAR_SHAPE.BAR_Y_UNITS + LAY_BAR_SHAPE.BAR_HEIGHT_UNITS;
  return {
    kind:     'path',
    key:      'bar-head',
    pathData: `M${numberText(headStartX)} ${numberText(LAY_BAR_SHAPE.BAR_Y_UNITS)} H${numberText(arcStartX)} `
      + `A${numberText(radius)} ${numberText(radius)} 0 0 1 ${numberText(arcStartX)} ${numberText(bottomY)} H${numberText(headStartX)}Z`,
    fill: 'body',
    opacity,
  };
}

export const LAY_BAR_PROP = propDefinition({
  name:     'layBar',
  hidden:   Object.freeze<LayBarState>({ shown: 0, barLength: LAY_BAR_SHAPE.BAR_MINIMUM_LENGTH_UNITS, barOpacity: 0 }),
  layer:    'behind-body',
  shapesOf: (state: LayBarState) => ({
    opacity: state.shown,
    shapes:  [
      {
        kind:        'line',
        key:         'row',
        x1:          LAY_BAR_SHAPE.ROW_START_X_UNITS,
        y1:          LAY_BAR_SHAPE.ROW_Y_UNITS,
        x2:          LAY_BAR_SHAPE.ROW_END_X_UNITS,
        y2:          LAY_BAR_SHAPE.ROW_Y_UNITS,
        stroke:      'graphite',
        strokeWidth: LAY_BAR_SHAPE.ROW_STROKE_UNITS,
        opacity:     LAY_BAR_SHAPE.ROW_OPACITY,
      },
      {
        kind:         'rectangle',
        key:          'bar',
        x:            LAY_BAR_SHAPE.BAR_END_X_UNITS - state.barLength,
        y:            LAY_BAR_SHAPE.BAR_Y_UNITS,
        width:        state.barLength,
        height:       LAY_BAR_SHAPE.BAR_HEIGHT_UNITS,
        cornerRadius: LAY_BAR_SHAPE.BAR_CORNER_RADIUS_UNITS,
        fill:         'emberLight',
        opacity:      state.barOpacity,
      },
      barHeadOf(state.barOpacity),
    ],
  }),
});
