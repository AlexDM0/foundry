/**
 * The wall of Hatch. What matters: the wall, its slot, then the papers in front of it; a paper shows only up to the wall, so it gets
 * narrower from its far end as it goes into the slot; the reply carries its body-coloured line and a small tick; the stub is dashed as a
 * draft; and the hidden state draws.
 */
import { expect, test } from 'bun:test';

import { HATCH_WALL_PROP } from './HatchWallProp.ts';

const NO_PAPER = { nearX: 44, centreY: -29, opacity: 0 } as const;

test('the wall and its slot, then the note, the reply with its line and tick, and the stub', () => {
  const drawing = HATCH_WALL_PROP.shapesOf({
    shown: 1, cycleOpacity: 1, note: NO_PAPER, reply: NO_PAPER, replyTickOpacity: 0, stub: NO_PAPER,
  }, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['wall', 'slot', 'note', 'reply', 'reply-line', 'reply-tick', 'stub']);
  expect(drawing.shapes[0]).toMatchObject({
    x: 44, y: -52, width: 4, height: 44, fill: 'hardware', stroke: 'graphite', strokeWidth: 1.2,
  });
  expect(drawing.shapes[1]).toMatchObject({
    x: 44, y: -32, width: 4, height: 6, fill: 'graphite',
  });
});

test('a paper partly in the slot shows only up to the wall', () => {
  const { shapes } = HATCH_WALL_PROP.shapesOf({
    shown: 1, cycleOpacity: 1, note: { nearX: 39.5, centreY: -29, opacity: 1 }, reply: NO_PAPER, replyTickOpacity: 0, stub: NO_PAPER,
  }, { facing: 1, holdingHand: null });
  expect(shapes[2]).toMatchObject({
    x: 39.5, y: -32, width: 4.5, height: 6, fill: 'paper', stroke: 'paperEdge', opacity: 1,
  });
  expect(shapes[3]).toMatchObject({ width: 0, opacity: 0 });
});

test('the reply carries its line and its small tick; the stub is dashed', () => {
  const { shapes } = HATCH_WALL_PROP.shapesOf({
    shown:            1,
    cycleOpacity:     1,
    note:             NO_PAPER,
    reply:            { nearX: 35, centreY: -29, opacity: 1 },
    replyTickOpacity: 1,
    stub:             { nearX: 33, centreY: -26, opacity: 1 },
  }, { facing: 1, holdingHand: null });
  expect(shapes[3]).toMatchObject({ x: 35, width: 9 });
  expect(shapes[4]).toMatchObject({
    x1: 38, y1: -30.5, x2: 43, stroke: 'body', opacity: 1,
  });
  expect(shapes[5]).toMatchObject({ stroke: 'done', opacity: 1 });
  expect(shapes[5]?.unmirroredAboutX).toBeCloseTo(40.5);
  expect(shapes[6]).toMatchObject({
    x: 33, y: -28, width: 5, height: 4, dash: [2, 2],
  });
});

test('the hidden state draws, with nothing seen', () => {
  const drawing = HATCH_WALL_PROP.shapesOf(HATCH_WALL_PROP.hidden, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0);
  expect(drawing.shapes).toHaveLength(7);
});
