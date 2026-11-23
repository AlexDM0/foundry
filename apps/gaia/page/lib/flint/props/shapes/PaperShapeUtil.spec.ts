/**
 * The paper of the shared vocabulary. What matters: a ready paper is the outline with a solid edge; a draft has a
 * dashed edge of 2 and 2 and a fill of 0.55; the header sits 1 unit in from the top edges; the mini sheet is the paper at 55% around its
 * centre (38, -28), moved so that centre lands on the point given, and a ticket can be scaled alike to any size; a waiting ticket's header
 * is grey.
 */
import { expect, test } from 'bun:test';

import { PaperShapeUtil } from './PaperShapeUtil.ts';

test('a ready paper has a solid edge; a draft a dashed edge and a fill that lets the ground through', () => {
  const ready = PaperShapeUtil.paperOf({ key: 'paper' });
  const draft = PaperShapeUtil.paperOf({ key: 'paper', isDraft: true });
  expect(ready).toMatchObject({
    kind: 'polygon', points: [{ x: 28, y: -46 }, { x: 48, y: -42 }, { x: 48, y: -10 }, { x: 28, y: -14 }], fill: 'paper', stroke: 'paperEdge', strokeWidth: 1.2,
  });
  expect([ready.dash, ready.fillOpacity]).toEqual([undefined, undefined]);
  expect([draft.dash, draft.fillOpacity]).toEqual([[2, 2], 0.55]);
});

test('the header is in the body colour, 1 unit in from the top edges', () => {
  expect(PaperShapeUtil.headerOf('header')).toMatchObject({ fill: 'body', points: [{ x: 29, y: -44.8 }, { x: 47, y: -41.2 }, { x: 47, y: -37.6 }, { x: 29, y: -41.2 }] });
});

test('the mini sheet scales the paper to 55% around its centre and moves that centre to the point', () => {
  expect(PaperShapeUtil.miniSheetTransformOf({ x: 10, y: -20 })).toEqual([
    { translateX: 10, translateY: -20 }, { scaleX: 0.55, scaleY: 0.55 }, { translateX: -38, translateY: 28 },
  ]);
});

test('a ticket scales around its centre to any size, and a waiting ticket has a grey header', () => {
  expect(PaperShapeUtil.scaledPaperTransformOf({ x: 38, y: -28 }, 0.8)).toEqual([
    { translateX: 38, translateY: -28 },
    { scaleX: 0.8, scaleY: 0.8 },
    { translateX: -38, translateY: 28 },
  ]);
  expect(PaperShapeUtil.headerOf('header', 'paperEdge').fill).toBe('paperEdge');
});
