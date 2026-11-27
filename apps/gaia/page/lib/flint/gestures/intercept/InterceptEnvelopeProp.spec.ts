/**
 * The envelope of Assistant intercept: the shared envelope turned and scaled around its centre, its closed or open flap, the paper rising
 * out of it, the tick that is never mirrored, and the holding hand.
 */
import { expect, test } from 'bun:test';

import type { Shape }                  from '../../drawing/Shape.ts';
import type { InterceptEnvelopeState } from './InterceptEnvelopeProp.ts';
import { INTERCEPT_ENVELOPE_PROP }     from './InterceptEnvelopeProp.ts';

const HELD_OPEN: InterceptEnvelopeState = {
  shown: 1, x: 34, y: -30, turnDegrees: 0, scale: 1, envelopeOpacity: 1, flapDepth: -5, paperRise: 6, tickOpacity: 0,
};

const shapesOf = (state: InterceptEnvelopeState): readonly Shape[] => INTERCEPT_ENVELOPE_PROP.shapesOf(state, { facing: 1, holdingHand: null }).shapes;

test('a closed flap is drawn over the front; an open flap folds up behind the paper and the front', () => {
  expect(shapesOf({ ...HELD_OPEN, flapDepth: 5, paperRise: 0 }).map((shape) => shape.key)).toEqual([
    'paper', 'paper-line-0', 'paper-line-1', 'envelope', 'envelope-seal', 'envelope-flap', 'tick',
  ]);
  const open = shapesOf(HELD_OPEN);
  expect(open.map((shape) => shape.key)).toEqual(['envelope-flap', 'paper', 'paper-line-0', 'paper-line-1', 'envelope', 'envelope-seal', 'tick']);
  const flap = open[0];
  expect(flap?.kind === 'path' ? flap.pathData : '').toBe('M34 -30 L41 -35 L48 -30');
});

test('the paper of 10 by 8 stands out of the top by its rise, with two lines; inside, it is hidden', () => {
  expect(shapesOf(HELD_OPEN).find((shape) => shape.key === 'paper')).toMatchObject({
    kind: 'rectangle', x: 36, y: -35, width: 10, height: 8, fill: 'paper', opacity: 1,
  });
  expect(shapesOf(HELD_OPEN).find((shape) => shape.key === 'paper-line-1')).toMatchObject({
    x1: 38, x2: 44, y1: -30, y2: -30, opacity: 1,
  });
  expect(shapesOf({ ...HELD_OPEN, paperRise: 0 }).find((shape) => shape.key === 'paper')?.opacity).toBe(0);
});

test('the envelope turns and scales around its own centre, and fades with its own opacity', () => {
  const front = shapesOf({
    ...HELD_OPEN, turnDegrees: -20, scale: 0.5, envelopeOpacity: 0.4,
  }).find((shape) => shape.key === 'envelope');
  expect(front?.transform).toEqual([
    { rotateDegrees: -20, aboutX: 41, aboutY: -25.5 },
    { translateX: 41, translateY: -25.5 },
    { scaleX: 0.5, scaleY: 0.5 },
    { translateX: -41, translateY: 25.5 },
  ]);
  expect(front).toMatchObject({ fill: 'paper', stroke: 'alarm', opacity: 0.4 });
});

test('the tick starts at (30, -48) and is never mirrored', () => {
  const tick = shapesOf({ ...HELD_OPEN, tickOpacity: 1 }).find((shape) => shape.key === 'tick');
  expect(tick?.kind === 'path' ? tick.pathData : '').toBe('M30 -48 l3 3 l6 -7');
  expect(tick?.unmirroredAboutX).toBeDefined();
});

test('a hand holds the lower corner: (30, -24) for the envelope at (34, -30)', () => {
  expect(INTERCEPT_ENVELOPE_PROP.gripOf?.(HELD_OPEN)).toEqual({ x: 30, y: -24 });
});

test('the hidden state draws, at no opacity', () => {
  expect(INTERCEPT_ENVELOPE_PROP.shapesOf(INTERCEPT_ENVELOPE_PROP.hidden, { facing: -1, holdingHand: null }).opacity).toBe(0);
});
