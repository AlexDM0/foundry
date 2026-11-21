/**
 * The stack of Reorder. What matters: four cards with their tabs, the third card's tab in the body colour and drawn last, on top; the two
 * cards above it move down by the drop, the last card stays; a hand holds the moved card just beyond its right end.
 */
import { expect, test } from 'bun:test';

import { REORDER_STACK_PROP, movedCardGripOf } from './ReorderStackProp.ts';

test('the cards with their tabs, the moved card drawn last, the cards above it dropped', () => {
  const drawing = REORDER_STACK_PROP.shapesOf({
    shown: 1, cycleOpacity: 1, movedCardX: 42, movedCardY: -49, cardsAboveDrop: 7,
  }, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['card-0', 'tab-0', 'card-1', 'tab-1', 'card-3', 'tab-3', 'card-2', 'tab-2']);
  const byKey = Object.fromEntries(drawing.shapes.map((shape) => [shape.key, shape]));
  expect([byKey['card-0'], byKey['card-1'], byKey['card-3'], byKey['card-2']].map((shape) => (shape?.kind === 'rectangle' ? [shape.x, shape.y] : null)))
    .toEqual([[30, -35], [30, -28], [30, -21], [42, -49]]);
  expect([byKey['tab-2']?.fill, byKey['tab-0']?.fill]).toEqual(['body', 'paperEdge']);
});

test('the grip is 2 beyond the card\'s right end, at its middle height', () => {
  expect(movedCardGripOf({ movedCardX: 30, movedCardY: -28 })).toEqual({ x: 50, y: -25.5 });
  const lifted = {
    shown: 1, cycleOpacity: 1, movedCardX: 42, movedCardY: -49, cardsAboveDrop: 7,
  };
  expect(REORDER_STACK_PROP.gripOf?.(lifted)).toEqual({ x: 62, y: -46.5 });
});
