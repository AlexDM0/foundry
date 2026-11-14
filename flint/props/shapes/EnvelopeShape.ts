/** The envelope of the shared vocabulary (`06-more-animations.md`): an incident, with its flap and seal. */
import type { Shape, TransformStep } from '../../drawing/Shape.ts';
import { SvgTextUtil }               from '../../drawing/SvgTextUtil.ts';
import { ENVELOPE_SHAPE }            from './constants/SharedShapes.ts';

export interface EnvelopeOptions {
  readonly key:          string;
  /** The top left corner, before the turn and the scale. */
  readonly x:            number;
  readonly y:            number;
  /** How far the flap's tip is below the top edge; negative opens it up, behind the top. The closed flap by default. */
  readonly flapDepth?:   number;
  /** Around the envelope's centre; none by default. */
  readonly turnDegrees?: number;
  /** Around the envelope's centre; 1 by default. */
  readonly scale?:       number;
  readonly opacity?:     number;
}

/** The turn and the scale of the envelope, for a shape that moves with it, such as a letter inside. */
export function envelopePlacementOf(options: EnvelopeOptions): { readonly transform?: readonly TransformStep[] } {
  const turnDegrees = options.turnDegrees ?? 0;
  const scale = options.scale ?? 1;
  if (turnDegrees === 0 && scale === 1) return {};
  const centreX = options.x + (ENVELOPE_SHAPE.WIDTH_UNITS / 2);
  const centreY = options.y + (ENVELOPE_SHAPE.HEIGHT_UNITS / 2);
  return {
    transform: [
      { rotateDegrees: turnDegrees, aboutX: centreX, aboutY: centreY },
      { translateX: centreX, translateY: centreY },
      { scaleX: scale, scaleY: scale },
      { translateX: -centreX, translateY: -centreY },
    ],
  };
}

export function envelopeShapesOf(options: EnvelopeOptions): readonly Shape[] {
  const { numberText } = SvgTextUtil;
  const { x, y } = options;
  const halfWidth = ENVELOPE_SHAPE.WIDTH_UNITS / 2;
  const sealHalf = ENVELOPE_SHAPE.SEAL_SIDE_UNITS / 2;
  const flapPoint = `${numberText(x + halfWidth)} ${numberText(y + (options.flapDepth ?? ENVELOPE_SHAPE.FLAP_DEPTH_UNITS))}`;
  const placement = envelopePlacementOf(options);
  const faded = options.opacity === undefined ? {} : { opacity: options.opacity };
  return [
    {
      kind:        'rectangle',
      key:         options.key,
      x,
      y,
      width:       ENVELOPE_SHAPE.WIDTH_UNITS,
      height:      ENVELOPE_SHAPE.HEIGHT_UNITS,
      fill:        'paper',
      stroke:      'alarm',
      strokeWidth: ENVELOPE_SHAPE.STROKE_UNITS,
      ...faded,
      ...placement,
    },
    {
      kind:        'path',
      key:         `${options.key}-flap`,
      pathData:    `M${numberText(x)} ${numberText(y)} L${flapPoint} L${numberText(x + ENVELOPE_SHAPE.WIDTH_UNITS)} ${numberText(y)}`,
      fill:        'none',
      stroke:      'alarm',
      strokeWidth: ENVELOPE_SHAPE.FLAP_STROKE_UNITS,
      lineJoin:    'round',
      ...faded,
      ...placement,
    },
    {
      kind:   'rectangle',
      key:    `${options.key}-seal`,
      x:      x + halfWidth - sealHalf,
      y:      y + (ENVELOPE_SHAPE.HEIGHT_UNITS / 2) - sealHalf,
      width:  ENVELOPE_SHAPE.SEAL_SIDE_UNITS,
      height: ENVELOPE_SHAPE.SEAL_SIDE_UNITS,
      fill:   'alarm',
      ...faded,
      ...placement,
    },
  ];
}
