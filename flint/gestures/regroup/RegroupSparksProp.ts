/**
 * The Watchers of Regrouping (`06-more-animations.md`): four sparks, each drawn in three looks that cross over: dim (the dark ember colour
 * with no core), live (the spark of the vocabulary, with the spring on its scale) and dead (the grey spark). The places ease at the hand
 * rate, so the bob of the live sparks starts without a jump.
 */
import type { Shape }     from '../../drawing/Shape.ts';
import { propDefinition } from '../../props/PropDefinition.ts';
import { PropEasingUtil } from '../../props/PropEasingUtil.ts';
import { SparkShapeUtil } from '../../props/shapes/SparkShapeUtil.ts';

export interface RegroupSparkState {
  readonly centreX:     number;
  readonly centreY:     number;
  readonly dimOpacity:  number;
  readonly liveOpacity: number;
  readonly liveScale:   number;
  readonly deadOpacity: number;
}

export interface RegroupSparksState {
  readonly shown:        number;
  /** Multiplies the opacity: the fade in and out of the sparks within the cycle. */
  readonly cycleOpacity: number;
  readonly sparks:       readonly RegroupSparkState[];
}

function sparkShapesOf(spark: RegroupSparkState, index: number): readonly Shape[] {
  const place = { centreX: spark.centreX, centreY: spark.centreY };
  return [
    ...SparkShapeUtil.sparkOf({
      key: `dim-${index}`, ...place, look: 'dim', opacity: spark.dimOpacity,
    }),
    ...SparkShapeUtil.sparkOf({
      key: `dead-${index}`, ...place, look: 'dead', opacity: spark.deadOpacity,
    }),
    ...SparkShapeUtil.sparkOf({
      key: `live-${index}`, ...place, opacity: spark.liveOpacity, scale: spark.liveScale,
    }),
  ];
}

export const REGROUP_SPARKS_PROP = propDefinition({
  name:    'regroupSparks',
  hidden:  Object.freeze<RegroupSparksState>({ shown: 0, cycleOpacity: 1, sparks: Object.freeze([]) }),
  layer:   'behind-body',
  easedOf: (drawn: RegroupSparksState, target: RegroupSparksState, handFraction: number) => {
    const eased = PropEasingUtil.easedShownLevelOf(drawn, target, handFraction);
    if (target.shown === 0) return eased;
    return {
      ...eased,
      sparks: target.sparks.map((spark, i) => {
        const from = drawn.sparks[i] ?? spark;
        return {
          ...spark,
          centreX: PropEasingUtil.easedTowards(from.centreX, spark.centreX, handFraction),
          centreY: PropEasingUtil.easedTowards(from.centreY, spark.centreY, handFraction),
        };
      }),
    };
  },
  shapesOf: (state: RegroupSparksState) => ({
    opacity: state.shown * state.cycleOpacity,
    shapes:  state.sparks.flatMap(sparkShapesOf),
  }),
});
