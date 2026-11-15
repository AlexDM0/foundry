/**
 * The page shapes of Chase the bug. What matters: the bug is the shared bug at the scale given, scaled about its own centre and mirrored to
 * the way it faces, with its wiggle kept; the link is a dashed crimson line of width 1 between the two points; and the ticket is the mini
 * sheet with a crimson dot, centred on the point given, at the opacity given.
 */
import { expect, test } from 'bun:test';

import { BugShapeUtil }       from '../../props/shapes/BugShapeUtil.ts';
import { PaperShapeUtil }     from '../../props/shapes/PaperShapeUtil.ts';
import { ChasePageShapeUtil } from './ChasePageShapeUtil.ts';

test('the bug is the shared bug, scaled about its centre and mirrored to the way it faces, with its wiggle', () => {
  const shapes = ChasePageShapeUtil.bugShapesOf({
    centre: { x: 300, y: 600 }, scale: 1.5, facing: -1, turnDegrees: 7,
  });
  const shared = BugShapeUtil.bugOf({
    key: 'bug', centreX: 300, centreY: 600, turnDegrees: 7,
  });
  expect(shapes.map((shape) => shape.key)).toEqual(shared.map((shape) => shape.key));
  expect(shapes[0]?.transform).toEqual([
    { translateX: 300, translateY: 600 },
    { scaleX: -1.5, scaleY: 1.5 },
    { translateX: -300, translateY: -600 },
    { rotateDegrees: 7, aboutX: 300, aboutY: 600 },
  ]);
});

test('the link is a dashed crimson line of width 1 between the bug and the element', () => {
  expect(ChasePageShapeUtil.linkShapeOf({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({
    kind: 'line', key: 'link', x1: 1, y1: 2, x2: 3, y2: 4, stroke: 'alarm', strokeWidth: 1, dash: [2, 2],
  });
});

test('the ticket is the mini sheet with a crimson dot, centred on the point, at the opacity given', () => {
  const [sheet, dot] = ChasePageShapeUtil.ticketShapesOf({ x: 400, y: 500 }, 0.4);
  const transform = PaperShapeUtil.miniSheetTransformOf({ x: 400, y: 500 });
  expect(sheet).toMatchObject({
    key: 'ticket', fill: 'paper', opacity: 0.4, transform
  });
  expect(dot).toMatchObject({
    kind: 'circle', key: 'ticket-dot', fill: 'alarm', opacity: 0.4, transform,
  });
});
