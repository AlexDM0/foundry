/**
 * The dome of Sandbox (`06-more-animations.md`): a half ellipse of water over Flint, drawn in front of all other parts at half opacity.
 * It lights up to full opacity where the hand meets it, and two short ripples of light water show at the contact.
 */
import type { Shape }         from '../../drawing/Shape.ts';
import { SvgTextUtil }        from '../../drawing/SvgTextUtil.ts';
import { propDefinition }     from '../../props/PropDefinition.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import { DOME_SHAPE }         from './constants/SandboxValues.ts';

export interface SandboxDomeState {
  readonly shown:          number;
  /** From 0, the dome at its resting opacity, to 1, at full opacity. */
  readonly flash:          number;
  readonly ripplesOpacity: number;
}

/** A ripple is an arc around the contact point, opening away from Flint. */
function rippleOf(radius: number, index: number, opacity: number): Shape {
  const { numberText } = SvgTextUtil;
  const halfAngle = AnimationCurveUtil.radiansOf(DOME_SHAPE.RIPPLE_HALF_ANGLE_DEGREES);
  const startX = DOME_SHAPE.CONTACT_X_UNITS + (radius * Math.cos(halfAngle));
  const startY = DOME_SHAPE.CONTACT_Y_UNITS - (radius * Math.sin(halfAngle));
  const endY = DOME_SHAPE.CONTACT_Y_UNITS + (radius * Math.sin(halfAngle));
  return {
    kind:        'path',
    key:         `ripple-${index}`,
    pathData:    `M${numberText(startX)} ${numberText(startY)} A${numberText(radius)} ${numberText(radius)} 0 0 1 ${numberText(startX)} ${numberText(endY)}`,
    fill:        'none',
    stroke:      'water',
    strokeWidth: DOME_SHAPE.RIPPLE_STROKE_UNITS,
    lineCap:     'round',
    opacity,
  };
}

export const SANDBOX_DOME_PROP = propDefinition({
  name:     'sandboxDome',
  hidden:   Object.freeze<SandboxDomeState>({ shown: 0, flash: 0, ripplesOpacity: 0 }),
  layer:    'in-front-of-all',
  shapesOf: (state: SandboxDomeState) => ({
    opacity: state.shown * (DOME_SHAPE.RESTING_OPACITY + ((1 - DOME_SHAPE.RESTING_OPACITY) * state.flash)),
    shapes:  [
      {
        kind:        'path',
        key:         'dome',
        pathData:    DOME_SHAPE.PATH,
        fill:        'water',
        fillOpacity: DOME_SHAPE.FILL_OPACITY,
        stroke:      'water',
        strokeWidth: DOME_SHAPE.STROKE_UNITS,
      },
      ...DOME_SHAPE.RIPPLE_RADII_UNITS.map((radius, i) => rippleOf(radius, i, state.ripplesOpacity)),
    ],
  }),
});
