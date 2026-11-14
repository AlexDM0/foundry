/**
 * The socket of Unplugged. What matters: the cable leaves the plug's left edge and follows it, then takes the handoff's curve to the
 * floor; the prongs are drawn before the plate, so a plug that is in hides them; the slots are green once connected; the warning lines are
 * crimson; the pulse is on the cable; and a held hand sits on the plug.
 */
import { expect, test } from 'bun:test';

import { UNPLUGGED_SOCKET_PROP } from './UnpluggedSocketProp.ts';

const PLUGGED_IN = {
  ...UNPLUGGED_SOCKET_PROP.hidden, shown: 1, sceneOpacity: 1, plugX: 42, isConnected: true, pulseAlong: 1, pulseOpacity: 1,
};

function shapesOf(state: typeof PLUGGED_IN): ReturnType<typeof UNPLUGGED_SOCKET_PROP.shapesOf>['shapes'] {
  return UNPLUGGED_SOCKET_PROP.shapesOf(state, { facing: 1, holdingHand: null }).shapes;
}

test('the cable and its pulse, the prongs and the plug, then the plate, its slots and the warning, then the sparks', () => {
  expect(shapesOf(PLUGGED_IN).map((shape) => shape.key)).toEqual([
    'cable', 'pulse', 'prong-0', 'prong-1', 'plug', 'plate', 'slot-0', 'slot-1', 'warning-0', 'warning-1', 'spark-0', 'spark-1', 'spark-2',
  ]);
});

test('the cable follows the plug: from its left edge to the start of the curve, then through (24, -10) to the floor at (12, 2)', () => {
  expect(shapesOf({ ...PLUGGED_IN, plugX: 34 })[0]).toMatchObject({ pathData: 'M34 -28 L30 -27 Q24 -10 12 2' });
  expect(shapesOf(PLUGGED_IN)[0]).toMatchObject({
    pathData: 'M42 -28 L38 -27 Q24 -10 12 2', stroke: 'graphite', strokeWidth: 1.4, fill: 'none'
  });
});

test('the pulse is a light circle of 2 on the cable: at its end, on the floor', () => {
  expect(shapesOf(PLUGGED_IN)[1]).toMatchObject({
    kind: 'circle', centreX: 12, centreY: 2, radius: 2, fill: 'emberLight'
  });
});

test('the plug is 6 by 4 with two prongs of 2 on its socket side; the plate at (48, -34), 6 by 12, with slots at the prongs', () => {
  const shapes = shapesOf(PLUGGED_IN);
  expect(shapes[4]).toMatchObject({
    x: 42, y: -30, width: 6, height: 4, fill: 'graphite'
  });
  expect(shapes[2]).toMatchObject({
    x: 48, y: -29.2, width: 2, height: 0.8
  });
  expect(shapes[5]).toMatchObject({
    x: 48, y: -34, width: 6, height: 12, cornerRadius: 1, fill: 'graphite'
  });
  expect(shapes[6]).toMatchObject({ x: 48.5, fill: 'done' });
  expect(shapesOf({ ...PLUGGED_IN, isConnected: false })[6]).toMatchObject({ fill: 'hardware' });
  expect(shapes[8]).toMatchObject({ stroke: 'alarm', strokeWidth: 1 });
});

test('a held hand sits on the plug', () => {
  expect(UNPLUGGED_SOCKET_PROP.gripOf?.(PLUGGED_IN)).toEqual({ x: 38, y: -28 });
});
