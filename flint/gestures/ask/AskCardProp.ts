/**
 * The card of Needs an answer (`06-more-animations.md`): a paper card with "?", which is never mirrored. A hand is held just below its
 * bottom left corner, and the card turns around that hold, so the card and the hand move as one rigid part.
 */
import type { Point }         from '../../SpriteGeometry.ts';
import type { TransformStep } from '../../drawing/Shape.ts';
import { MARK_TEXT_SHAPE }    from '../../marks/constants/MarkShapes.ts';
import { QUESTION_TEXT }      from '../../marks/question/constants/QuestionValues.ts';
import { propDefinition }     from '../../props/PropDefinition.ts';
import { ASK_CARD_SHAPE }     from './constants/AskValues.ts';

export interface AskCardState {
  readonly shown:       number;
  /** Around the card's centre. */
  readonly scale:       number;
  /** Positive is down; the hold moves with it. */
  readonly offsetY:     number;
  /** Around the hold. */
  readonly turnDegrees: number;
}

/** The hold before the offset: the bottom left corner after the scale, a little below it. */
function holdBeforeOffsetOf(scale: number): Point {
  return {
    x: ASK_CARD_SHAPE.CENTRE_X_UNITS + (scale * (ASK_CARD_SHAPE.X_UNITS - ASK_CARD_SHAPE.CENTRE_X_UNITS)),
    y: ASK_CARD_SHAPE.CENTRE_Y_UNITS + (scale * (ASK_CARD_SHAPE.Y_UNITS + ASK_CARD_SHAPE.HEIGHT_UNITS - ASK_CARD_SHAPE.CENTRE_Y_UNITS))
      + ASK_CARD_SHAPE.HOLD_BELOW_CORNER_UNITS,
  };
}

function cardTransformOf(state: AskCardState): readonly TransformStep[] {
  const hold = holdBeforeOffsetOf(state.scale);
  const scaled: readonly TransformStep[] = state.scale === 1 ? [] : [
    { translateX: ASK_CARD_SHAPE.CENTRE_X_UNITS, translateY: ASK_CARD_SHAPE.CENTRE_Y_UNITS },
    { scaleX: state.scale, scaleY: state.scale },
    { translateX: -ASK_CARD_SHAPE.CENTRE_X_UNITS, translateY: -ASK_CARD_SHAPE.CENTRE_Y_UNITS },
  ];
  return [{ translateX: 0, translateY: state.offsetY }, { rotateDegrees: state.turnDegrees, aboutX: hold.x, aboutY: hold.y }, ...scaled];
}

export const ASK_CARD_PROP = propDefinition({
  name:   'askCard',
  hidden: Object.freeze<AskCardState>({
    shown: 0, scale: 1, offsetY: 0, turnDegrees: 0,
  }),
  layer:  'behind-body',
  gripOf: (state: AskCardState): Point => {
    const hold = holdBeforeOffsetOf(state.scale);
    return { x: hold.x, y: hold.y + state.offsetY };
  },
  shapesOf: (state: AskCardState) => ({
    opacity:   state.shown,
    transform: cardTransformOf(state),
    shapes:    [
      {
        kind:         'rectangle',
        key:          'card',
        x:            ASK_CARD_SHAPE.X_UNITS,
        y:            ASK_CARD_SHAPE.Y_UNITS,
        width:        ASK_CARD_SHAPE.WIDTH_UNITS,
        height:       ASK_CARD_SHAPE.HEIGHT_UNITS,
        cornerRadius: ASK_CARD_SHAPE.CORNER_RADIUS_UNITS,
        fill:         'paper',
        stroke:       'paperEdge',
        strokeWidth:  ASK_CARD_SHAPE.STROKE_UNITS,
      },
      {
        kind:             'text',
        key:              'question',
        x:                ASK_CARD_SHAPE.CENTRE_X_UNITS,
        y:                ASK_CARD_SHAPE.CENTRE_Y_UNITS + ASK_CARD_SHAPE.GLYPH_BASELINE_BELOW_CENTRE_UNITS,
        text:             QUESTION_TEXT.TEXT,
        fontFamily:       MARK_TEXT_SHAPE.FONT_FAMILY,
        fontSize:         ASK_CARD_SHAPE.GLYPH_SIZE_UNITS,
        fontWeight:       MARK_TEXT_SHAPE.FONT_WEIGHT,
        fill:             'hand',
        unmirroredAboutX: ASK_CARD_SHAPE.CENTRE_X_UNITS,
      },
    ],
  }),
});
