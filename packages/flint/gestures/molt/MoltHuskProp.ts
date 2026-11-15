/**
 * The husk that Molt leaves: the body path in the husk colour with two grey eyes where the eyes were. Behind the body, it is hidden by
 * the body at the shed and shows as it falls back: it moves and turns around the bottom tip.
 */
import { BODY_SHAPE, EYE_SHAPE } from '../../constants/BodyShape.ts';
import type { Shape }            from '../../drawing/Shape.ts';
import { propDefinition }        from '../../props/PropDefinition.ts';
import { HUSK }                  from './constants/MoltValues.ts';

export interface MoltHuskState {
  readonly shown:       number;
  readonly offsetX:     number;
  readonly offsetY:     number;
  /** Around the bottom tip. */
  readonly turnDegrees: number;
  readonly opacity:     number;
}

function huskEyeOf(key: string, eyeX: number): Shape {
  return {
    kind:   'rectangle',
    key,
    x:      eyeX + HUSK.EYE_SHIFT_UNITS,
    y:      EYE_SHAPE.TOP_Y_UNITS + ((EYE_SHAPE.HEIGHT_UNITS - HUSK.EYE_HEIGHT_UNITS) / 2),
    width:  EYE_SHAPE.WIDTH_UNITS,
    height: HUSK.EYE_HEIGHT_UNITS,
    fill:   'paperFold',
  };
}

export const MOLT_HUSK_PROP = propDefinition({
  name:   'moltHusk',
  hidden: Object.freeze<MoltHuskState>({
    shown: 0, offsetX: 0, offsetY: 0, turnDegrees: 0, opacity: HUSK.OPACITY,
  }),
  layer:    'behind-body',
  shapesOf: (state: MoltHuskState) => ({
    opacity:   state.shown * state.opacity,
    transform: [{ translateX: state.offsetX, translateY: state.offsetY }, { rotateDegrees: state.turnDegrees }],
    shapes:    [
      {
        kind: 'path', key: 'husk', pathData: BODY_SHAPE.PATH, fill: 'husk',
      },
      huskEyeOf('left-eye', EYE_SHAPE.LEFT_EYE_X_UNITS),
      huskEyeOf('right-eye', EYE_SHAPE.RIGHT_EYE_X_UNITS),
    ],
  }),
});
