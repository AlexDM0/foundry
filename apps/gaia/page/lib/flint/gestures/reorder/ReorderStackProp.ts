/**
 * The stack of Reorder: four cards of paper with a tab at their left end. The third card, whose tab is in the
 * body colour, moves on its own and is drawn on top; a hand holds it at its right end, so the card and the hand move as one part.
 */
import type { Point }                  from '../../SpriteGeometry.ts';
import type { Shape }                  from '../../drawing/Shape.ts';
import { propDefinition }              from '../../props/PropDefinition.ts';
import { REORDER_HAND, REORDER_STACK } from './constants/ReorderValues.ts';

export interface ReorderStackState {
  readonly shown:          number;
  /** Multiplies the opacity: the fade in and out of the stack in its cycle. */
  readonly cycleOpacity:   number;
  /** The top left corner of the card that moves. */
  readonly movedCardX:     number;
  readonly movedCardY:     number;
  /** How far the cards above the moved one have gone down. */
  readonly cardsAboveDrop: number;
}

/** Where the hand holds the moved card: just beyond its right end, at its middle height. */
export function movedCardGripOf(state: Pick<ReorderStackState, 'movedCardX' | 'movedCardY'>): Point {
  return {
    x: state.movedCardX + REORDER_STACK.CARD_WIDTH_UNITS + REORDER_HAND.BEYOND_CARD_UNITS,
    y: state.movedCardY + (REORDER_STACK.CARD_HEIGHT_UNITS / 2),
  };
}

function cardShapesOf(cardIndex: number, leftX: number, topY: number): readonly Shape[] {
  return [
    {
      kind:         'rectangle',
      key:          `card-${cardIndex}`,
      x:            leftX,
      y:            topY,
      width:        REORDER_STACK.CARD_WIDTH_UNITS,
      height:       REORDER_STACK.CARD_HEIGHT_UNITS,
      cornerRadius: REORDER_STACK.CARD_CORNER_UNITS,
      fill:         'paper',
      stroke:       'paperEdge',
      strokeWidth:  REORDER_STACK.CARD_STROKE_UNITS,
    },
    {
      kind:         'rectangle',
      key:          `tab-${cardIndex}`,
      x:            leftX,
      y:            topY,
      width:        REORDER_STACK.TAB_WIDTH_UNITS,
      height:       REORDER_STACK.CARD_HEIGHT_UNITS,
      cornerRadius: REORDER_STACK.CARD_CORNER_UNITS,
      fill:         cardIndex === REORDER_STACK.MOVED_CARD_INDEX ? 'body' : 'paperEdge',
    },
  ];
}

export const REORDER_STACK_PROP = propDefinition({
  name:   'reorderStack',
  hidden: Object.freeze<ReorderStackState>({
    shown:          0,
    cycleOpacity:   1,
    movedCardX:     REORDER_STACK.CARD_X_UNITS,
    movedCardY:     REORDER_STACK.CARD_Y_UNITS[REORDER_STACK.MOVED_CARD_INDEX] ?? 0,
    cardsAboveDrop: 0,
  }),
  layer:    'behind-body',
  gripOf:   (state: ReorderStackState) => movedCardGripOf(state),
  shapesOf: (state: ReorderStackState) => ({
    opacity: state.shown * state.cycleOpacity,
    shapes:  [
      ...REORDER_STACK.CARD_Y_UNITS.flatMap((cardY, cardIndex) => {
        if (cardIndex === REORDER_STACK.MOVED_CARD_INDEX) return [];
        const drop = cardIndex < REORDER_STACK.MOVED_CARD_INDEX ? state.cardsAboveDrop : 0;
        return cardShapesOf(cardIndex, REORDER_STACK.CARD_X_UNITS, cardY + drop);
      }),
      ...cardShapesOf(REORDER_STACK.MOVED_CARD_INDEX, state.movedCardX, state.movedCardY),
    ],
  }),
});
