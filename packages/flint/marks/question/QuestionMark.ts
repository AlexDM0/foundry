/** The "?" of `01-character.md`: the same size as "!". */
import { markDefinition, NO_MARK_DETAILS } from '../MarkDefinition.ts';
import { markTextShapeOf }                 from '../MarkTextShape.ts';
import { SHARED_MARK_ANCHOR }              from '../constants/MarkShapes.ts';
import { QUESTION_TEXT }                   from './constants/QuestionValues.ts';

export const QUESTION_MARK = markDefinition({
  name:        'question',
  anchorX:     SHARED_MARK_ANCHOR.ANCHOR_X_UNITS,
  anchorY:     SHARED_MARK_ANCHOR.ANCHOR_Y_UNITS,
  scale:       SHARED_MARK_ANCHOR.SCALE,
  restDetails: NO_MARK_DETAILS,
  shapesOf:    () => [markTextShapeOf(QUESTION_TEXT.TEXT, QUESTION_TEXT.SIZE_UNITS)],
});
