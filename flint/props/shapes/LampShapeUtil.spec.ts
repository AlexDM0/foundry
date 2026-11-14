/**
 * The lamp of the shared vocabulary. What matters: a circle of 2.2, grey with an edge when off, pulsing orange when running, green or
 * crimson; a smaller lamp on a post, and a lamp that fades.
 */
import { expect, test } from 'bun:test';

import { LampShapeUtil } from './LampShapeUtil.ts';

const lampIn = (state: 'off' | 'running' | 'passed' | 'failed', elapsedMilliseconds = 0) => LampShapeUtil.lampOf({
  key: 'lamp', centreX: 30, centreY: -26, state, elapsedMilliseconds,
});

test('an off lamp is grey with an edge; a passed one green; a failed one crimson', () => {
  expect(lampIn('off')).toMatchObject({
    kind: 'circle', radius: 2.2, fill: 'paperFold', stroke: 'paperEdge', strokeWidth: 0.8,
  });
  expect([lampIn('passed').fill, lampIn('failed').fill]).toEqual(['done', 'alarm']);
});

test('a running lamp pulses by 0.6 + 0.4 × sin(t / 90)', () => {
  expect(lampIn('running', 141).fill).toBe('body');
  expect(lampIn('running', 141).opacity).toBeCloseTo(0.6 + (0.4 * Math.sin(141 / 90)), 9);
  expect(LampShapeUtil.runningOpacityAt(0)).toBe(0.6);
});

test('a lamp on a post is smaller and can fade; a running one fades with its pulse', () => {
  expect(LampShapeUtil.lampOf({
    key: 'lamp', centreX: 0, centreY: 0, state: 'passed', elapsedMilliseconds: 0, radiusUnits: 1.6, opacity: 0.5,
  })).toMatchObject({ radius: 1.6, opacity: 0.5 });
  expect(LampShapeUtil.lampOf({
    key: 'lamp', centreX: 0, centreY: 0, state: 'running', elapsedMilliseconds: 0, opacity: 0.5,
  }).opacity).toBeCloseTo(0.3, 9);
});
