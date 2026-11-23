/** The thinking dots: three squares that show one after the other. */
import { markDefinition }      from '../MarkDefinition.ts';
import { SHARED_MARK_ANCHOR }  from '../constants/MarkShapes.ts';
import { THINKING_DOTS_SHAPE } from './constants/ThinkingDotsValues.ts';

export interface ThinkingDotsDetails {
  /** How many dots show, from the left. */
  readonly dotsShown: number;
}

export const THINKING_DOTS_MARK = markDefinition({
  name:        'thinking-dots',
  anchorX:     SHARED_MARK_ANCHOR.ANCHOR_X_UNITS,
  anchorY:     SHARED_MARK_ANCHOR.ANCHOR_Y_UNITS,
  scale:       SHARED_MARK_ANCHOR.SCALE,
  restDetails: Object.freeze<ThinkingDotsDetails>({ dotsShown: 0 }),
  shapesOf:    (details: ThinkingDotsDetails) => THINKING_DOTS_SHAPE.X_UNITS.map((dotX, i) => ({
    kind:    'rectangle',
    key:     `dot-${i}`,
    x:       dotX,
    y:       THINKING_DOTS_SHAPE.Y_UNITS,
    width:   THINKING_DOTS_SHAPE.SIDE_UNITS,
    height:  THINKING_DOTS_SHAPE.SIDE_UNITS,
    fill:    'thinking',
    opacity: i < details.dotsShown ? 1 : 0,
  } as const)),
});
