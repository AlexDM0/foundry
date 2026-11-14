/** The four small sparks of the flare of Refuel, each placed, turned and faded by the gesture; behind the body, so they burst out from it. */
import { propDefinition }       from '../../props/PropDefinition.ts';
import { SparkShapeUtil }       from '../../props/shapes/SparkShapeUtil.ts';
import type { SmallSparkPlace } from '../../props/shapes/SparkShapeUtil.ts';
import { SNAP_SPARKS }          from '../constants/SnapSparks.ts';
import { REFUEL_SPARKS }        from './constants/OutOfFuelValues.ts';

export interface RefuelSparksState {
  readonly shown:  number;
  readonly sparks: readonly SmallSparkPlace[];
}

export const REFUEL_SPARKS_PROP = propDefinition({
  name:   'refuelSparks',
  hidden: Object.freeze<RefuelSparksState>({
    shown:  0,
    sparks: Object.freeze(SNAP_SPARKS.WAYS.map(() => Object.freeze({
      x: REFUEL_SPARKS.CENTRE_X_UNITS, y: REFUEL_SPARKS.CENTRE_Y_UNITS, turnDegrees: 0, opacity: 0,
    }))),
  }),
  layer:    'behind-body',
  shapesOf: (state: RefuelSparksState) => ({
    opacity: state.shown,
    shapes:  state.sparks.map((spark, i) => SparkShapeUtil.smallSparkOf({
      key: `spark-${i}`, x: spark.x, y: spark.y, turnDegrees: spark.turnDegrees, opacity: spark.opacity,
    })),
  }),
});
