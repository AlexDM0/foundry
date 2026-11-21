/** The dial of Wind-down: a graphite ring with a square pointer on it, at the pointer's angle (0 forward, negative up). */
import { propDefinition }     from '../../props/PropDefinition.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import { DIAL }               from './constants/WindDownValues.ts';

export interface WindDownDialState {
  readonly shown:          number;
  readonly pointerDegrees: number;
  /** Multiplies the opacity: the fade in and out the gesture times itself. */
  readonly fade:           number;
}

export const WIND_DOWN_DIAL_PROP = propDefinition({
  name:     'windDownDial',
  hidden:   Object.freeze<WindDownDialState>({ shown: 0, pointerDegrees: DIAL.POINTER_START_DEGREES, fade: 1 }),
  layer:    'behind-body',
  shapesOf: (state: WindDownDialState) => {
    const angle = AnimationCurveUtil.radiansOf(state.pointerDegrees);
    const pointerX = DIAL.CENTRE_X_UNITS + (DIAL.RING_RADIUS_UNITS * Math.cos(angle));
    const pointerY = DIAL.CENTRE_Y_UNITS + (DIAL.RING_RADIUS_UNITS * Math.sin(angle));
    const pointerHalf = DIAL.POINTER_SIDE_UNITS / 2;
    return {
      opacity: state.shown * state.fade,
      shapes:  [
        {
          kind:        'circle',
          key:         'ring',
          centreX:     DIAL.CENTRE_X_UNITS,
          centreY:     DIAL.CENTRE_Y_UNITS,
          radius:      DIAL.RING_RADIUS_UNITS,
          fill:        'none',
          stroke:      'graphite',
          strokeWidth: DIAL.RING_STROKE_UNITS,
        },
        {
          kind:      'rectangle',
          key:       'pointer',
          x:         pointerX - pointerHalf,
          y:         pointerY - pointerHalf,
          width:     DIAL.POINTER_SIDE_UNITS,
          height:    DIAL.POINTER_SIDE_UNITS,
          fill:      'body',
          transform: [{ rotateDegrees: state.pointerDegrees, aboutX: pointerX, aboutY: pointerY }],
        },
      ],
    };
  },
});
