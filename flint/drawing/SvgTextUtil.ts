/** How Flint writes a number, a transform, a polygon's points and a paint as SVG attribute values. */
import type { Point }                from '../SpriteGeometry.ts';
import { FLINT_COLOURS }             from '../constants/Palette.ts';
import type { Paint, TransformStep } from './Shape.ts';
import { SVG_TEXT }                  from './constants/SvgText.ts';

function numberText(value: number): string {
  return String(Number(value.toFixed(SVG_TEXT.ATTRIBUTE_DECIMALS)) + 0);
}

function stepText(step: TransformStep): string {
  if ('translateX' in step) return `translate(${numberText(step.translateX)} ${numberText(step.translateY)})`;
  if ('scaleX' in step) return `scale(${numberText(step.scaleX)} ${numberText(step.scaleY)})`;
  if ('aboutX' in step) return `rotate(${numberText(step.rotateDegrees)} ${numberText(step.aboutX)} ${numberText(step.aboutY)})`;
  return `rotate(${numberText(step.rotateDegrees)})`;
}

export const SvgTextUtil = Object.freeze({
  /** Rounded to the overlay's decimals, with no negative zero. */
  numberText,

  transformText: (steps: readonly TransformStep[]): string => steps.map(stepText).join(' '),

  pointsText: (points: readonly Point[]): string => points.map((point) => `${numberText(point.x)},${numberText(point.y)}`).join(' '),

  /** A colour role is its custom property with the palette's default, so a host can change it. */
  paintText: (paint: Paint): string => {
    if (paint === 'none') return 'none';
    if (typeof paint === 'object') return `url(#${paint.gradient})`;
    const colour = FLINT_COLOURS[paint];
    return `var(${colour.property}, ${colour.fallback})`;
  },
});
