/**
 * The spark of Crash resume: the spark of a Watcher at the body centre, which pulses while only the outline of the body shows. It is
 * behind the body, so the body's fill covers it again as the fill comes back.
 */
import { propDefinition } from '../../props/PropDefinition.ts';
import { SparkShapeUtil } from '../../props/shapes/SparkShapeUtil.ts';
import { CORE_SPARK }     from './constants/CrashResumeValues.ts';

export interface CrashSparkState {
  readonly shown: number;
  /** Around its centre. */
  readonly scale: number;
  /** Multiplies the opacity: its fade out while the gesture still gives it. */
  readonly fade:  number;
}

export const CRASH_SPARK_PROP = propDefinition({
  name:     'crashSpark',
  hidden:   Object.freeze<CrashSparkState>({ shown: 0, scale: 1, fade: 1 }),
  layer:    'behind-body',
  shapesOf: (state: CrashSparkState) => ({
    opacity:   state.shown * state.fade,
    transform: [
      { translateX: CORE_SPARK.CENTRE_X_UNITS, translateY: CORE_SPARK.CENTRE_Y_UNITS },
      { scaleX: state.scale, scaleY: state.scale },
      { translateX: -CORE_SPARK.CENTRE_X_UNITS, translateY: -CORE_SPARK.CENTRE_Y_UNITS },
    ],
    shapes: SparkShapeUtil.sparkOf({ key: 'spark', centreX: CORE_SPARK.CENTRE_X_UNITS, centreY: CORE_SPARK.CENTRE_Y_UNITS }),
  }),
});
