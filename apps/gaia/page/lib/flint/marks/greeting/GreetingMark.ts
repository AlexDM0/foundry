/** The "Hi!" that a wave shows. */
import { markDefinition, NO_MARK_DETAILS } from '../MarkDefinition.ts';
import { markTextShapeOf }                 from '../MarkTextShape.ts';
import { GREETING_ANCHOR, GREETING_TEXT }  from './constants/GreetingValues.ts';


export const GREETING_MARK = markDefinition({
  name:        'greeting',
  anchorX:     GREETING_ANCHOR.ANCHOR_X_UNITS,
  anchorY:     GREETING_ANCHOR.ANCHOR_Y_UNITS,
  scale:       GREETING_ANCHOR.SCALE,
  restDetails: NO_MARK_DETAILS,
  shapesOf:    () => [markTextShapeOf(GREETING_TEXT.TEXT, GREETING_TEXT.SIZE_UNITS)],
});
