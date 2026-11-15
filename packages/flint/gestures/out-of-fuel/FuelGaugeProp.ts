/** The gauge of Out of fuel and Refuel: the budget of the shared vocabulary at its place, with three marks at its quarters. */
import type { FlintColourRole }     from '../../constants/Palette.ts';
import type { Shape }               from '../../drawing/Shape.ts';
import { propDefinition }           from '../../props/PropDefinition.ts';
import { gaugeShapesOf }            from '../../props/shapes/GaugeShape.ts';
import { GAUGE_SHAPE }              from '../../props/shapes/constants/SharedShapes.ts';
import { EMPTY_GAUGE, GAUGE_MARKS } from './constants/OutOfFuelValues.ts';

export interface FuelGaugeState {
  readonly shown:        number;
  /** From 0 empty to 1 full. */
  readonly level:        number;
  readonly levelColour:  FlintColourRole;
  readonly levelOpacity: number;
  /** Multiplies the opacity: the fade out of the full gauge while the gesture still gives it. */
  readonly fade:         number;
}

function quarterMarkOf(quarter: number): Shape {
  const markX = EMPTY_GAUGE.X_UNITS + GAUGE_SHAPE.WIDTH_UNITS;
  const markY = EMPTY_GAUGE.Y_UNITS + ((GAUGE_SHAPE.HEIGHT_UNITS * quarter) / GAUGE_MARKS.QUARTER_COUNT);
  return {
    kind:        'line',
    key:         `mark-${quarter}`,
    x1:          markX,
    y1:          markY,
    x2:          markX + GAUGE_MARKS.LENGTH_UNITS,
    y2:          markY,
    stroke:      'graphite',
    strokeWidth: GAUGE_MARKS.STROKE_UNITS,
  };
}

export const FUEL_GAUGE_PROP = propDefinition({
  name:   'fuelGauge',
  hidden: Object.freeze<FuelGaugeState>({
    shown: 0, level: EMPTY_GAUGE.LEVEL, levelColour: 'alarm', levelOpacity: 1, fade: 1,
  }),
  layer:    'behind-body',
  shapesOf: (state: FuelGaugeState) => ({
    opacity: state.shown * state.fade,
    shapes:  [
      ...gaugeShapesOf({
        key:          'gauge',
        x:            EMPTY_GAUGE.X_UNITS,
        y:            EMPTY_GAUGE.Y_UNITS,
        level:        state.level,
        levelColour:  state.levelColour,
        levelOpacity: state.levelOpacity,
      }),
      ...GAUGE_MARKS.QUARTERS.map(quarterMarkOf),
    ],
  }),
});
