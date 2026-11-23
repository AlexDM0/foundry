/** The four printed lines of Review's sheet, parallel to its top edge; the line Flint reads is in the body colour. */
import type { Shape }  from '../../drawing/Shape.ts';
import { SvgTextUtil } from '../../drawing/SvgTextUtil.ts';
import { SHEET_SHAPE } from './constants/SheetShape.ts';

/** `readLineIndex` null reads no line. */
export function sheetLineShapesOf(readLineIndex: number | null): readonly Shape[] {
  const { numberText } = SvgTextUtil;
  return Array.from({ length: SHEET_SHAPE.LINE_COUNT }, (_unused, i): Shape => {
    const lineY = SHEET_SHAPE.FIRST_LINE_Y_UNITS + (i * SHEET_SHAPE.LINE_SPACING_UNITS);
    return {
      kind:        'path',
      key:         `line-${i}`,
      pathData:    `M${SHEET_SHAPE.LINE_START_X_UNITS} ${numberText(lineY)} L${SHEET_SHAPE.LINE_END_X_UNITS} ${numberText(lineY + SHEET_SHAPE.LINE_DROP_UNITS)}`,
      fill:        'none',
      stroke:      readLineIndex === i ? 'body' : 'paperText',
      strokeWidth: SHEET_SHAPE.LINE_STROKE_UNITS,
      lineCap:     'round',
    };
  });
}
