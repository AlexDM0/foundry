/**
 * The dome of Sandbox against `06-more-animations.md`, "Sandbox". What matters: the dome is the given path, a water fill at 8% with a
 * water stroke of 1, in front of all other parts at half opacity, and at full opacity when it flashes; the two ripples are water arcs 1.5
 * wide (the handoff's light water cannot be read on a light ground) at the contact point (34, -34), opening away from Flint; the hidden state draws.
 */
import { expect, test } from 'bun:test';

import type { SandboxDomeState } from './SandboxDomeProp.ts';
import { SANDBOX_DOME_PROP }     from './SandboxDomeProp.ts';

const drawingOf = (state: SandboxDomeState) => SANDBOX_DOME_PROP.shapesOf(state, { facing: 1, holdingHand: null });

test('the dome is drawn in front of all other parts, with its path, fill and stroke', () => {
  expect(SANDBOX_DOME_PROP.layer).toBe('in-front-of-all');
  expect(drawingOf({ shown: 1, flash: 0, ripplesOpacity: 0 }).shapes[0]).toEqual({
    kind:        'path',
    key:         'dome',
    pathData:    'M-34 6 A38 64 0 0 1 42 6',
    fill:        'water',
    fillOpacity: 0.08,
    stroke:      'water',
    strokeWidth: 1,
  });
});

test('the dome rests at half opacity and is at full opacity when it flashes', () => {
  expect(drawingOf({ shown: 1, flash: 0, ripplesOpacity: 0 }).opacity).toBe(0.5);
  expect(drawingOf({ shown: 1, flash: 1, ripplesOpacity: 0 }).opacity).toBe(1);
  expect(drawingOf({ shown: 0.5, flash: 0.5, ripplesOpacity: 0 }).opacity).toBeCloseTo(0.375);
});

test('two water ripples are arcs around the contact point, opening away from Flint', () => {
  const ripples = drawingOf({ shown: 1, flash: 1, ripplesOpacity: 0.4 }).shapes.slice(1);
  expect(ripples).toHaveLength(2);
  for (const ripple of ripples) {
    expect(ripple).toMatchObject({
      kind: 'path', stroke: 'water', strokeWidth: 1.5, fill: 'none', opacity: 0.4,
    });
    const numbers = (ripple.kind === 'path' ? ripple.pathData : '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const [startX, startY, endX, endY] = [numbers[0], numbers[1], numbers[7], numbers[8]];
    expect(startX).toBeGreaterThan(34);
    expect(endX).toBe(startX ?? Number.NaN);
    expect(((startY ?? 0) + (endY ?? 0)) / 2).toBeCloseTo(-34);
  }
});

test('the hidden state draws, at no opacity', () => {
  expect(drawingOf(SANDBOX_DOME_PROP.hidden).opacity).toBe(0);
});
