/** The "!" of `01-character.md`. */
import { markDefinition, NO_MARK_DETAILS } from '../MarkDefinition.ts';
import { markTextShapeOf }                 from '../MarkTextShape.ts';
import { SHARED_MARK_ANCHOR }              from '../constants/MarkShapes.ts';
import { EXCLAMATION_TEXT }                from './constants/ExclamationValues.ts';

export const EXCLAMATION_MARK = markDefinition({
  name:        'exclamation',
  anchorX:     SHARED_MARK_ANCHOR.ANCHOR_X_UNITS,
  anchorY:     SHARED_MARK_ANCHOR.ANCHOR_Y_UNITS,
  scale:       SHARED_MARK_ANCHOR.SCALE,
  restDetails: NO_MARK_DETAILS,
  shapesOf:    () => [markTextShapeOf(EXCLAMATION_TEXT.TEXT, EXCLAMATION_TEXT.SIZE_UNITS)],
});
