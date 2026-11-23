/** The lamp of the shared vocabulary: one gate check, off, running, passed or failed. */
import type { Shape } from '../../drawing/Shape.ts';
import { LAMP_SHAPE } from './constants/SharedShapes.ts';

export type LampState = 'off' | 'running' | 'passed' | 'failed';

export interface LampOptions {
  readonly key:                 string;
  readonly centreX:             number;
  readonly centreY:             number;
  readonly state:               LampState;
  /** The gesture's time, for the pulse of a running lamp. */
  readonly elapsedMilliseconds: number;
  /** The lamp of a gate check by default; a lamp on a post is smaller. */
  readonly radiusUnits?:        number;
  /** Multiplies the pulse of a running lamp. */
  readonly opacity?:            number;
}

export const LampShapeUtil = Object.freeze({
  lampOf: (options: LampOptions): Shape => {
    const opacity = options.opacity ?? 1;
    const circle = {
      kind:    'circle',
      key:     options.key,
      centreX: options.centreX,
      centreY: options.centreY,
      radius:  options.radiusUnits ?? LAMP_SHAPE.RADIUS_UNITS,
      ...(opacity === 1 ? {} : { opacity }),
    } as const;
    if (options.state === 'off') return {
      ...circle, fill: 'paperFold', stroke: 'paperEdge', strokeWidth: LAMP_SHAPE.OFF_STROKE_UNITS
    };
    if (options.state === 'passed') return { ...circle, fill: 'done' };
    if (options.state === 'failed') return { ...circle, fill: 'alarm' };
    return { ...circle, fill: 'body', opacity: opacity * LampShapeUtil.runningOpacityAt(options.elapsedMilliseconds) };
  },

  runningOpacityAt: (elapsedMilliseconds: number): number => LAMP_SHAPE.RUNNING_BASE_OPACITY
    + (LAMP_SHAPE.RUNNING_PULSE_OPACITY * Math.sin(elapsedMilliseconds / LAMP_SHAPE.RUNNING_PULSE_DIVISOR_MILLISECONDS)),
});
