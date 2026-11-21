/**
 * The plug. What matters: the cable from the middle of the plug's back to (44, -43) through a control point that drops as it goes slack,
 * so far that the slack cable hangs below the line from the plug to the spark;
 * the plug with its prongs at its front; the socket with its two slots drawn over them; two small sparks only while they fly.
 */
import { expect, test } from 'bun:test';

import { FORCED_STOP_PLUG_PROP } from './ForcedStopPlugProp.ts';

const drawingOf = (cableSlack: number, socketSparkFlight: number) => FORCED_STOP_PLUG_PROP.shapesOf({
  shown: 1, plugX: 34, plugY: -14, cableSlack, socketSparkFlight, fade: 0.5,
}, { facing: 1, holdingHand: null });

test('the cable, the plug and its prongs, then the socket and its slots, then the sparks, in that order', () => {
  const drawing = drawingOf(0, 0);
  expect(drawing.opacity).toBe(0.5);
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['cable', 'prong-0', 'prong-1', 'plug', 'socket', 'slot-0', 'slot-1', 'socket-spark-0', 'socket-spark-1']);
  expect(drawing.shapes[3]).toMatchObject({
    x: 34, y: -14, width: 6, height: 4, fill: 'graphite'
  });
  expect(drawing.shapes[1]).toMatchObject({ x: 40, width: 2 });
  expect(drawing.shapes[4]).toMatchObject({
    x: 46, y: -16, width: 8, height: 8, cornerRadius: 1
  });
  expect(drawing.shapes[5]?.fill).toBe('hardware');
});

test('the cable goes slack: its control point moves from (30, -24) to (42, 2)', () => {
  expect(drawingOf(0, 0).shapes[0]).toMatchObject({ pathData: 'M34 -12 Q30 -24 44 -43', stroke: 'graphite', strokeWidth: 1.2 });
  expect(drawingOf(1, 0).shapes[0]).toMatchObject({ pathData: 'M34 -12 Q42 2 44 -43' });
});

test('the slack cable from the pulled plug sags further from its straight line than the taut cable bows from its own', () => {
  const bowOf = (start: readonly [number, number], control: readonly [number, number]): number => {
    const [endX, endY] = [44, -43];
    const lengthOfLine = Math.hypot(endX - start[0], endY - start[1]);
    return Math.abs(((endX - start[0]) * (control[1] - start[1])) - ((endY - start[1]) * (control[0] - start[0]))) / lengthOfLine;
  };
  expect(bowOf([28, -12], [42, 2])).toBeGreaterThan(bowOf([40, -12], [30, -24]));
});

test('the socket sparks show only while they fly, fading as they go', () => {
  expect(drawingOf(0, 0).shapes.slice(-2).map((shape) => shape.opacity)).toEqual([0, 0]);
  expect(drawingOf(0, 0.25).shapes.slice(-2).map((shape) => shape.opacity)).toEqual([0.75, 0.75]);
});
