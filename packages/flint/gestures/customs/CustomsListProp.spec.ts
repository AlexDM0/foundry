/**
 * The list of Customs. What matters: the list, then for each claim its box and its line at the claim's height; a found claim gets a small
 * tick and a claim not found a small cross, each centred on its box and never mirrored; facing left the box and the line change ends
 * within the list, so on the screen the box stays at the left of its line.
 */
import { expect, test } from 'bun:test';

import { CUSTOMS_LIST_PROP } from './CustomsListProp.ts';

const STATE = { shown: 1, cycleOpacity: 1, verdicts: ['found', 'unchecked', 'not-found'] } as const;

test('the list, then each claim with its box, its line and its verdict', () => {
  const drawing = CUSTOMS_LIST_PROP.shapesOf(STATE, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['list', 'box-0', 'line-0', 'tick-0', 'box-1', 'line-1', 'box-2', 'line-2', 'cross-2']);
  expect(drawing.shapes[0]).toMatchObject({
    x: 30, y: -52, width: 16, height: 20, fill: 'paper', stroke: 'paperEdge', strokeWidth: 1.2,
  });
  expect(drawing.shapes[1]).toMatchObject({
    x: 32.5, y: -46.9, width: 1.8, height: 1.8,
  });
  expect(drawing.shapes[2]).toMatchObject({
    x1: 36, y1: -46, x2: 43, y2: -46, stroke: 'paperText',
  });
  expect(drawing.shapes[3]).toMatchObject({ stroke: 'done' });
  expect(drawing.shapes[3]?.unmirroredAboutX).toBeCloseTo(33.4);
  expect(drawing.shapes[8]).toMatchObject({ stroke: 'alarm' });
  expect(drawing.shapes[8]?.unmirroredAboutX).toBeCloseTo(33.4);
});

test('facing left, the box and the line change ends within the list, and the verdict stays centred on its box', () => {
  const drawing = CUSTOMS_LIST_PROP.shapesOf(STATE, { facing: -1, holdingHand: null });
  expect(drawing.shapes[1]).toMatchObject({ x: 41.7 });
  expect(drawing.shapes[2]).toMatchObject({ x1: 33, x2: 40 });
  expect(drawing.shapes[3]?.unmirroredAboutX).toBeCloseTo(42.6);
});

test('the hidden state draws an unchecked list, fully faded', () => {
  const drawing = CUSTOMS_LIST_PROP.shapesOf(CUSTOMS_LIST_PROP.hidden, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0);
  expect(drawing.shapes).toHaveLength(7);
});
