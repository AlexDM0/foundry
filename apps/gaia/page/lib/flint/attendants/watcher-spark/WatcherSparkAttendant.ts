/**
 * Spark companion: one spark for each Watcher the host counts, in an arc up along Flint's back. Each spark
 * bobs, turns and pulses on its own phase, and enters with the spring of an emote mark. Under reduced motion it holds still at scale 1.
 */
import { SPRING }                              from '../../constants/Motion.ts';
import { SparkShapeUtil }                      from '../../props/shapes/SparkShapeUtil.ts';
import { AnimationCurveUtil }                  from '../../utils/AnimationCurveUtil.ts';
import { attendantDefinition }                 from '../AttendantDefinition.ts';
import { WATCHER_SPARK, WATCHER_SPARK_EXTENT } from './constants/WatcherSparkValues.ts';

export const WATCHER_SPARK_ATTENDANT = attendantDefinition({
  name:         'watcher-spark',
  maximumCount: WATCHER_SPARK.MAXIMUM_COUNT,
  extent:       WATCHER_SPARK_EXTENT,
  memberPoseOf: (input) => {
    const place = WATCHER_SPARK.PLACES[Math.min(input.index, WATCHER_SPARK.PLACES.length - 1)] ?? WATCHER_SPARK.PLACES[0];
    const restX = place.X_UNITS;
    const restY = place.Y_UNITS;
    if (input.reducedMotion) {
      return {
        x: restX, y: restY, turnDegrees: WATCHER_SPARK.TURN_START_DEGREES, scale: 1,
      };
    }
    const time = input.elapsedMilliseconds;
    const bob = WATCHER_SPARK.BOB_UNITS * Math.sin((time / WATCHER_SPARK.BOB_DIVISOR_MILLISECONDS) + (WATCHER_SPARK.BOB_PHASE_PER_SPARK * input.index));
    const pulse = 1 + (WATCHER_SPARK.PULSE_FACTOR * Math.sin((time / WATCHER_SPARK.PULSE_DIVISOR_MILLISECONDS) + input.index));
    return {
      x:           restX,
      y:           restY + bob,
      turnDegrees: WATCHER_SPARK.TURN_START_DEGREES + (WATCHER_SPARK.TURN_DEGREES_PER_MILLISECOND * time),
      scale:       pulse * AnimationCurveUtil.springScaleAt(input.ageMilliseconds / SPRING.DURATION_MILLISECONDS),
    };
  },
  shapesOf: () => SparkShapeUtil.sparkOf({
    key: 'spark', centreX: 0, centreY: 0, turnDegrees: 0
  }),
});
