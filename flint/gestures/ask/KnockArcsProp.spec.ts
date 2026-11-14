/**
 * The knock arcs. What matters: two short arcs of radius 9.5 above the knuckle, in the paper edge colour at width 1, under the opacity of
 * the knock; they are symmetric about the knuckle, so a mirror keeps them above it.
 */
import { expect, test } from 'bun:test';

import { KNOCK_ARCS_PROP } from './KnockArcsProp.ts';

test('two arcs of radius 9.5 above the knuckle, faded by the knock', () => {
  const drawing = KNOCK_ARCS_PROP.shapesOf({
    shown: 1, centreX: 26, centreY: -38, opacity: 0.4,
  }, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.4);
  expect(drawing.shapes.map((shape) => [shape.key, shape.stroke, shape.strokeWidth])).toEqual([
    ['arc-0', 'paperEdge', 1],
    ['arc-1', 'paperEdge', 1],
  ]);
  const left = drawing.shapes[0];
  expect(left?.kind === 'path' ? left.pathData : '').toBe('M17.77 -42.75 A9.5 9.5 0 0 1 21.99 -46.61');
});
