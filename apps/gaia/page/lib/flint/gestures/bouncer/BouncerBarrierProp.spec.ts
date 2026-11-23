/**
 * The barrier of Bouncer. What matters: the post is a graphite line from (46, -8) to (46, -30)
 * with a knob of radius 2; the rope runs from the hand to the post while hooked and hangs to (30, -8) once unhooked, in crimson; the cross
 * stands at 70% scale centred on (46, -40), and the tick starts at (42, -44), both never mirrored; the hidden state draws.
 */
import { expect, test } from 'bun:test';

import type { Shape }                       from '../../drawing/Shape.ts';
import type { BouncerBarrierState }         from './BouncerBarrierProp.ts';
import { BOUNCER_BARRIER_PROP, ropePathOf } from './BouncerBarrierProp.ts';

const SHOWN: BouncerBarrierState = {
  shown: 1, cycleOpacity: 0.5, unhooked: 0, crossOpacity: 1, tickOpacity: 0,
};

function shapeOf(state: BouncerBarrierState, key: string): Shape | undefined {
  return BOUNCER_BARRIER_PROP.shapesOf(state, { facing: 1, holdingHand: null }).shapes.find((shape) => shape.key === key);
}

test('the rope is the hooked path at 0 and the hanging path at 1', () => {
  expect(ropePathOf(0)).toBe('M26 -26 Q36 -18 46 -30');
  expect(ropePathOf(1)).toBe('M26 -26 Q28 -14 30 -8');
  expect(ropePathOf(0.5)).toBe('M26 -26 Q32 -16 38 -19');
});

test('the post, its knob and the crimson rope', () => {
  expect(shapeOf(SHOWN, 'post')).toMatchObject({
    kind: 'line', x1: 46, y1: -8, x2: 46, y2: -30, stroke: 'graphite', strokeWidth: 2,
  });
  expect(shapeOf(SHOWN, 'knob')).toMatchObject({
    kind: 'circle', centreX: 46, centreY: -30, radius: 2, fill: 'graphite',
  });
  expect(shapeOf(SHOWN, 'rope')).toMatchObject({ stroke: 'alarm', strokeWidth: 1.6, fill: 'none' });
});

test('the cross is centred on (46, -40) at 70% scale, the tick starts at (42, -44); neither is mirrored', () => {
  const cross = shapeOf(SHOWN, 'cross');
  expect(cross?.unmirroredAboutX).toBeCloseTo(46);
  expect(cross?.kind === 'path' ? cross.pathData : '').toBe('M43.55 -42.45 l7 7 M50.55 -42.45 l-7 7');
  expect(cross?.transform).toEqual([{ translateX: 43.55, translateY: -42.45 }, { scaleX: 0.7, scaleY: 0.7 }, { translateX: -43.55, translateY: 42.45 }]);
  const tick = shapeOf({ ...SHOWN, tickOpacity: 1 }, 'tick');
  expect(tick?.kind === 'path' ? tick.pathData : '').toBe('M42 -44 l3 3 l6 -7');
  expect(tick?.unmirroredAboutX).toBeDefined();
});

test('the drawing fades with the shown level and the cycle opacity; the hidden state draws at 0', () => {
  expect(BOUNCER_BARRIER_PROP.shapesOf(SHOWN, { facing: 1, holdingHand: null }).opacity).toBe(0.5);
  expect(BOUNCER_BARRIER_PROP.shapesOf(BOUNCER_BARRIER_PROP.hidden, { facing: -1, holdingHand: null }).opacity).toBe(0);
});
