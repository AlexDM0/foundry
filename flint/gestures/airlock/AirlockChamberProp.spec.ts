/**
 * The airlock of Airlock. What matters: the order (main line, chamber, the waiting blocks, the passing block and its landed colour, then
 * the doors over them, so a block passes under an open door); a door opens by raising its lower end from -20 to -32; the landed colour
 * rises from the bottom edge of the passing block; and the hidden state draws.
 */
import { expect, test } from 'bun:test';

import { AIRLOCK_CHAMBER_PROP } from './AirlockChamberProp.ts';

const STATE = {
  shown:            1,
  introOpacity:     1,
  doorOpenings:     [0.5, 1],
  queueDrop:        7,
  newcomerOpacity:  0.25,
  travellerX:       39.5,
  travellerY:       -25,
  travellerLanded:  0.4,
  travellerOpacity: 1,
} as const;

test('the main line, the chamber, the queue, the passing block, then the doors', () => {
  const drawing = AIRLOCK_CHAMBER_PROP.shapesOf(STATE, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual([
    'main-line', 'chamber', 'queue-1', 'queue-2', 'newcomer', 'traveller', 'traveller-landed', 'door-0', 'door-1',
  ]);
  expect(drawing.shapes[1]).toMatchObject({
    x: 36, y: -34, width: 14, height: 14, fill: 'paper', fillOpacity: 0.5, stroke: 'graphite', strokeWidth: 1.4,
  });
  expect(drawing.shapes[2]).toMatchObject({
    x: 24, y: -32, width: 7, height: 5, fill: 'emberLight',
  });
  expect(drawing.shapes[4]).toMatchObject({ y: -46, opacity: 0.25 });
});

test('the landed colour rises from the bottom edge of the passing block', () => {
  const landed = AIRLOCK_CHAMBER_PROP.shapesOf(STATE, { facing: 1, holdingHand: null }).shapes[6];
  expect(landed).toMatchObject({ fill: 'done', x: 39.5, y: -22 });
  expect(landed?.kind === 'rectangle' ? landed.height : 0).toBeCloseTo(2);
});

test('a door opens by raising its lower end from -20 to -32', () => {
  const { shapes } = AIRLOCK_CHAMBER_PROP.shapesOf(STATE, { facing: 1, holdingHand: null });
  expect(shapes[7]).toMatchObject({
    x1: 36, y1: -34, x2: 36, y2: -26, strokeWidth: 2.4,
  });
  expect(shapes[8]).toMatchObject({ x1: 50, y2: -32 });
});

test('the hidden state draws, with its doors closed', () => {
  const drawing = AIRLOCK_CHAMBER_PROP.shapesOf(AIRLOCK_CHAMBER_PROP.hidden, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0);
  expect(drawing.shapes[7]).toMatchObject({ y2: -20 });
});
