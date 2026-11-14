/**
 * The spark that Forced stop cuts off: the spark of a Watcher that bobs, then dies: its colour goes to the grey of a dead spark, it
 * shrinks to nothing around its centre, and it falls.
 */
import { propDefinition } from '../../props/PropDefinition.ts';
import { SparkShapeUtil } from '../../props/shapes/SparkShapeUtil.ts';
import { FED_SPARK }      from './constants/ForcedStopValues.ts';

export interface DyingSparkState {
  readonly shown:   number;
  /** Down from its place: the bob and the fall. */
  readonly offsetY: number;
  /** From 0 alive to 1 dead: the grey shows through, and the scale goes to 0. */
  readonly death:   number;
  /** Multiplies the opacity: the fade in and out the gesture times itself. */
  readonly fade:    number;
}

export const DYING_SPARK_PROP = propDefinition({
  name:   'dyingSpark',
  hidden: Object.freeze<DyingSparkState>({
    shown: 0, offsetY: 0, death: 0, fade: 1,
  }),
  layer:    'behind-body',
  shapesOf: (state: DyingSparkState) => {
    const centre = { centreX: FED_SPARK.CENTRE_X_UNITS, centreY: FED_SPARK.CENTRE_Y_UNITS };
    const scale = 1 - state.death;
    return {
      opacity:   state.shown * state.fade,
      transform: [
        { translateX: FED_SPARK.CENTRE_X_UNITS, translateY: FED_SPARK.CENTRE_Y_UNITS + state.offsetY },
        { scaleX: scale, scaleY: scale },
        { translateX: -FED_SPARK.CENTRE_X_UNITS, translateY: -FED_SPARK.CENTRE_Y_UNITS },
      ],
      shapes: [
        ...SparkShapeUtil.sparkOf({ key: 'live', ...centre, opacity: 1 - state.death }),
        ...SparkShapeUtil.sparkOf({
          key: 'dead', ...centre, look: 'dead', opacity: state.death,
        }),
      ],
    };
  },
});
