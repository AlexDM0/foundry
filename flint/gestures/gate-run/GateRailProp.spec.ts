/**
 * The rail of Gate run. What matters: a graphite rail of 28 by 8 at (26, -30) with corner radius 4; four lamps at x 31, 37, 43 and 49,
 * y -26, each drawn in its state by the shared lamp; and the tick from (36, -44), never mirrored.
 */
import { expect, test } from 'bun:test';

import { GATE_RAIL_PROP } from './GateRailProp.ts';

test('the rail, four lamps in their states and the tick, under the cycle fade', () => {
  const drawing = GATE_RAIL_PROP.shapesOf({
    shown: 1, opacity: 0.5, lampStates: ['passed', 'running', 'off', 'failed'], pulseMilliseconds: 0, tickOpacity: 1,
  }, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.5);
  expect(drawing.shapes[0]).toMatchObject({
    kind: 'rectangle', x: 26, y: -30, width: 28, height: 8, cornerRadius: 4, fill: 'graphite',
  });
  expect(drawing.shapes.slice(1, 5).map((shape) => [shape.kind === 'circle' ? shape.centreX : null, shape.fill])).toEqual([
    [31, 'done'],
    [37, 'body'],
    [43, 'paperFold'],
    [49, 'alarm'],
  ]);
  expect(drawing.shapes[5]).toMatchObject({ key: 'tick', pathData: 'M36 -44 l3 3 l6 -7', opacity: 1 });
});
