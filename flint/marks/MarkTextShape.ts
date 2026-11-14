/** The text of the "!", "?" and "Hi!" marks of `01-character.md`: centred on the anchor, bold, in the hand colour. */
import type { Shape }      from '../drawing/Shape.ts';
import { MARK_TEXT_SHAPE } from './constants/MarkShapes.ts';

export function markTextShapeOf(text: string, fontSize: number): Shape {
  return {
    kind:       'text',
    key:        'text',
    x:          0,
    y:          MARK_TEXT_SHAPE.BASELINE_Y_UNITS,
    text,
    fontFamily: MARK_TEXT_SHAPE.FONT_FAMILY,
    fontSize,
    fontWeight: MARK_TEXT_SHAPE.FONT_WEIGHT,
    fill:       'hand',
  };
}
