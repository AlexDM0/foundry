/**
 * The envelope of the shared vocabulary. What matters: a crimson-edged paper of 14 by 9, a flap down to 5 at its middle, a seal at its
 * centre; a flap that opens up, and an envelope that turns, scales and fades around its centre as one, with a letter inside it.
 */
import { expect, test } from 'bun:test';

import { envelopePlacementOf, envelopeShapesOf } from './EnvelopeShape.ts';

test('the paper, its flap and its seal, from the top left corner', () => {
  const [paper, flap, seal] = envelopeShapesOf({ key: 'envelope', x: 30, y: -40 });
  expect(paper).toMatchObject({
    kind: 'rectangle', x: 30, y: -40, width: 14, height: 9, fill: 'paper', stroke: 'alarm', strokeWidth: 1.2,
  });
  expect(flap).toMatchObject({
    kind: 'path', pathData: 'M30 -40 L37 -35 L44 -40', fill: 'none', stroke: 'alarm', strokeWidth: 1,
  });
  expect(seal).toMatchObject({
    x: 35.75, y: -36.75, width: 2.5, height: 2.5, fill: 'alarm',
  });
});

test('the flap opens up behind the top, and the whole envelope turns, scales and fades around its centre', () => {
  const options = {
    key: 'envelope', x: 30, y: -22, flapDepth: -5, turnDegrees: -20, scale: 0.5, opacity: 0.4,
  };
  const [front, flap, seal] = envelopeShapesOf(options);
  expect(flap).toMatchObject({ pathData: 'M30 -22 L37 -27 L44 -22' });
  expect([front?.opacity, flap?.opacity, seal?.opacity]).toEqual([0.4, 0.4, 0.4]);
  expect(front?.transform).toEqual([
    { rotateDegrees: -20, aboutX: 37, aboutY: -17.5 },
    { translateX: 37, translateY: -17.5 },
    { scaleX: 0.5, scaleY: 0.5 },
    { translateX: -37, translateY: 17.5 },
  ]);
  expect(envelopePlacementOf(options).transform).toEqual(front?.transform);
  expect(envelopePlacementOf({ key: 'envelope', x: 0, y: 0 })).toEqual({});
});
