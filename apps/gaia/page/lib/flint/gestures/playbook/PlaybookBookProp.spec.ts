/**
 * The small book of Playbook. What matters: the page is a paper rectangle 14 by 18 at
 * (30, -40) with four printed lines from x 33 to x 41, the read one in the body colour; the cover is the hand colour with a graphite spine
 * at x 30 and a body-colour diamond at its centre, and it narrows to the spine as it opens; every shape is never mirrored, so the spine
 * stays on the left on the screen; the hidden state draws.
 */
import { expect, test } from 'bun:test';

import type { Shape }             from '../../drawing/Shape.ts';
import type { PlaybookBookState } from './PlaybookBookProp.ts';
import { PLAYBOOK_BOOK_PROP }     from './PlaybookBookProp.ts';

const OPEN_ON_LINE_TWO: PlaybookBookState = {
  shown: 1, cycleOpacity: 1, coverWidth: 0, readLineIndex: 2,
};

function shapesOf(state: PlaybookBookState): readonly Shape[] {
  return PLAYBOOK_BOOK_PROP.shapesOf(state, { facing: 1, holdingHand: null }).shapes;
}

const shapeOf = (state: PlaybookBookState, key: string) => shapesOf(state).find((shape) => shape.key === key);

test('the page is paper with four printed lines; the read line is in the body colour', () => {
  expect(shapeOf(OPEN_ON_LINE_TWO, 'page')).toMatchObject({
    kind: 'rectangle', x: 30, y: -40, width: 14, height: 18, cornerRadius: 1, fill: 'paper', stroke: 'paperEdge',
  });
  const lines = [0, 1, 2, 3].map((i) => shapeOf(OPEN_ON_LINE_TWO, `line-${i}`));
  expect(lines.map((line) => (line?.kind === 'line' ? [line.x1, line.x2, line.y1, line.y2] : []))).toEqual([
    [33, 41, -35, -35],
    [33, 41, -31, -31],
    [33, 41, -27, -27],
    [33, 41, -23, -23],
  ]);
  expect(lines.map((line) => line?.stroke)).toEqual(['paperText', 'paperText', 'body', 'paperText']);
});

test('the closed cover is the hand colour, with a graphite spine at x 30 and a body-colour diamond at its centre', () => {
  const closed = { ...OPEN_ON_LINE_TWO, coverWidth: 1, readLineIndex: null };
  expect(shapeOf(closed, 'cover')).toMatchObject({
    x: 30, y: -40, width: 14, height: 18, fill: 'hand', opacity: 1,
  });
  expect(shapeOf(closed, 'spine')).toMatchObject({
    kind: 'line', x1: 30, x2: 30, y1: -40, y2: -22, stroke: 'graphite',
  });
  expect(shapeOf(closed, 'emblem')).toMatchObject({
    x: 35, y: -33, width: 4, height: 4, fill: 'body',
  });
  expect(shapeOf(closed, 'emblem')?.transform?.at(-1)).toEqual({ rotateDegrees: 45, aboutX: 37, aboutY: -31 });
});

test('the cover narrows to the spine as it opens, and an open cover is not drawn', () => {
  const halfOpen = shapeOf({ ...OPEN_ON_LINE_TWO, coverWidth: 0.5 }, 'cover');
  expect(halfOpen?.transform).toEqual([{ translateX: 30, translateY: 0 }, { scaleX: 0.5, scaleY: 1 }, { translateX: -30, translateY: 0 }]);
  expect(shapeOf(OPEN_ON_LINE_TWO, 'cover')?.opacity).toBe(0);
  expect(shapeOf(OPEN_ON_LINE_TWO, 'emblem')?.opacity).toBe(0);
});

test('every shape is never mirrored, about the book centre, so the spine stays on the left on the screen', () => {
  expect(shapesOf(OPEN_ON_LINE_TWO).every((shape) => shape.unmirroredAboutX === 37)).toBe(true);
});

test('the drawing fades with its levels; the hidden state draws at 0', () => {
  expect(PLAYBOOK_BOOK_PROP.shapesOf({ ...OPEN_ON_LINE_TWO, shown: 0.5, cycleOpacity: 0.5 }, { facing: 1, holdingHand: null }).opacity).toBe(0.25);
  expect(PLAYBOOK_BOOK_PROP.shapesOf(PLAYBOOK_BOOK_PROP.hidden, { facing: -1, holdingHand: null }).opacity).toBe(0);
});
