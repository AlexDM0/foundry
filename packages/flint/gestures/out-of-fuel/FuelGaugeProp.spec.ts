/**
 * The fuel gauge. What matters: the gauge of the shared vocabulary at (32, -40) with its level, and three graphite marks of 2 at the
 * quarters, out from its right side.
 */
import { expect, test } from 'bun:test';

import { FUEL_GAUGE_PROP } from './FuelGaugeProp.ts';

test('the gauge, its level and three marks at the quarters on its right side, faded by the gesture', () => {
  const drawing = FUEL_GAUGE_PROP.shapesOf({
    shown: 1, level: 0.5, levelColour: 'alarm', levelOpacity: 0.4, fade: 0.5,
  }, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.5);
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['gauge', 'gauge-level', 'mark-1', 'mark-2', 'mark-3']);
  expect(drawing.shapes[0]).toMatchObject({ x: 32, y: -40 });
  expect(drawing.shapes[1]).toMatchObject({ fill: 'alarm', opacity: 0.4, height: 11 });
  expect(drawing.shapes.slice(2).map((shape) => (shape.kind === 'line' ? [shape.x1, shape.x2, shape.y1] : []))).toEqual([
    [38, 40, -34],
    [38, 40, -28],
    [38, 40, -22],
  ]);
});
