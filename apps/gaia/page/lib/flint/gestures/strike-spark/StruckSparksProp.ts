/**
 * The sparks of Strike a spark: the small sparks of the strike, and the spark of the new Watcher, which grows
 * with the spring of an emote mark around its own centre.
 */
import type { Shape }           from '../../drawing/Shape.ts';
import { propDefinition }       from '../../props/PropDefinition.ts';
import { SparkShapeUtil }       from '../../props/shapes/SparkShapeUtil.ts';
import type { SmallSparkPlace } from '../../props/shapes/SparkShapeUtil.ts';
import { STRUCK_WATCHER }       from './constants/StrikeSparkValues.ts';

export interface StruckSparksState {
  readonly shown:          number;
  readonly watcherX:       number;
  readonly watcherY:       number;
  readonly watcherScale:   number;
  readonly watcherOpacity: number;
  readonly smallSparks:    readonly SmallSparkPlace[];
}

export const STRUCK_SPARKS_PROP = propDefinition({
  name:   'struckSparks',
  hidden: Object.freeze<StruckSparksState>({
    shown:          0,
    watcherX:       STRUCK_WATCHER.START_X_UNITS,
    watcherY:       STRUCK_WATCHER.START_Y_UNITS,
    watcherScale:   0,
    watcherOpacity: 0,
    smallSparks:    Object.freeze([]),
  }),
  layer:    'in-front-of-body',
  shapesOf: (state: StruckSparksState) => ({
    opacity: state.shown,
    shapes:  [
      ...state.smallSparks.map((spark, i): Shape => SparkShapeUtil.smallSparkOf({ key: `small-spark-${i}`, ...spark })),
      ...SparkShapeUtil.sparkOf({
        key: 'watcher', centreX: state.watcherX, centreY: state.watcherY, opacity: state.watcherOpacity, scale: state.watcherScale,
      }),
    ],
  }),
});
