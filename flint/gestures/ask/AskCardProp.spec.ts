/**
 * The card of Needs an answer. What matters: a paper card of 16 by 20 at (30, -44) with "?" in the hand colour on (38, -34), never
 * mirrored; the hand is held 2 below its bottom left corner, (30, -22) at full size, which the bob moves and the turn keeps; at 85% the
 * card shrinks around its centre and the hold moves with the corner.
 */
import { expect, test } from 'bun:test';

import { ASK_CARD_PROP } from './AskCardProp.ts';

const AT_REST = {
  shown: 1, scale: 1, offsetY: 0, turnDegrees: 0,
} as const;

test('a paper card with "?" in the hand colour, never mirrored about its centre', () => {
  const drawing = ASK_CARD_PROP.shapesOf(AT_REST, { facing: -1, holdingHand: null });
  expect(drawing.shapes[0]).toMatchObject({
    kind: 'rectangle', x: 30, y: -44, width: 16, height: 20, cornerRadius: 1.5, fill: 'paper', stroke: 'paperEdge', strokeWidth: 1.2,
  });
  expect(drawing.shapes[1]).toMatchObject({
    kind: 'text', text: '?', x: 38, fontSize: 12, fontWeight: 700, fill: 'hand', unmirroredAboutX: 38,
  });
});

test('the hold is 2 below the bottom left corner; the bob moves it and the card turns around it', () => {
  expect(ASK_CARD_PROP.gripOf?.(AT_REST)).toEqual({ x: 30, y: -22 });
  const swaying = { ...AT_REST, offsetY: 1.5, turnDegrees: 4, };
  expect(ASK_CARD_PROP.gripOf?.(swaying)).toEqual({ x: 30, y: -20.5 });
  expect(ASK_CARD_PROP.shapesOf(swaying, { facing: 1, holdingHand: null }).transform).toEqual([
    { translateX: 0, translateY: 1.5 },
    { rotateDegrees: 4, aboutX: 30, aboutY: -22 },
  ]);
});

test('at 85% the card shrinks around its centre, and the hold follows the corner', () => {
  const smaller = { ...AT_REST, scale: 0.85, offsetY: 6, };
  const grip = ASK_CARD_PROP.gripOf?.(smaller);
  expect(grip?.x).toBeCloseTo(31.2);
  expect(grip?.y).toBeCloseTo(-17.5);
  expect(ASK_CARD_PROP.shapesOf(smaller, { facing: 1, holdingHand: null }).transform?.slice(2)).toEqual([
    { translateX: 38, translateY: -34 },
    { scaleX: 0.85, scaleY: 0.85 },
    { translateX: -38, translateY: 34 },
  ]);
});
