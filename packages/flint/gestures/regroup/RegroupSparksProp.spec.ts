/**
 * The sparks of Regrouping against `06-more-animations.md`, "Regrouping". What matters: each spark is drawn dim (the dark ember colour, no
 * core), dead (the grey spark of the vocabulary) and live (the spark of the vocabulary, scaled around its centre by the spring), each at
 * its own opacity; the places ease at the hand rate while the sparks show, and keep the drawn state while they fade; the hidden state draws.
 */
import { expect, test } from 'bun:test';

import type { RegroupSparksState } from './RegroupSparksProp.ts';
import { REGROUP_SPARKS_PROP }     from './RegroupSparksProp.ts';

const ONE_SPARK: RegroupSparksState = {
  shown:        1,
  cycleOpacity: 1,
  sparks:       [{
    centreX: 28, centreY: -46, dimOpacity: 0.35, liveOpacity: 1, liveScale: 0.5, deadOpacity: 0,
  }],
};

const shapesOf = (state: RegroupSparksState) => REGROUP_SPARKS_PROP.shapesOf(state, { facing: 1, holdingHand: null }).shapes;

test('a spark is drawn dim, dead and live, back to front', () => {
  expect(shapesOf(ONE_SPARK).map((shape) => [shape.key, shape.fill, shape.opacity])).toEqual([
    ['dim-0', 'emberDark', 0.35],
    ['dead-0', 'paperEdge', 0],
    ['live-0', 'body', 1],
    ['live-0-core', 'emberLight', 1],
  ]);
});

test('the live spark is scaled by its spring around its centre, before its own turn', () => {
  expect(shapesOf(ONE_SPARK).find((shape) => shape.key === 'live-0')?.transform).toEqual([
    { translateX: 28, translateY: -46 },
    { scaleX: 0.5, scaleY: 0.5 },
    { translateX: -28, translateY: 46 },
    { rotateDegrees: 45, aboutX: 28, aboutY: -46 },
  ]);
});

test('the places ease at the hand rate while the sparks show; a fading prop keeps its drawn sparks', () => {
  const target = { ...ONE_SPARK, sparks: [{ ...ONE_SPARK.sparks[0], centreY: -40 }] } as RegroupSparksState;
  const eased = REGROUP_SPARKS_PROP.easedOf?.(ONE_SPARK, target, 0.5);
  expect(eased?.sparks[0]?.centreY).toBe(-43);
  const fading = REGROUP_SPARKS_PROP.easedOf?.(ONE_SPARK, REGROUP_SPARKS_PROP.hidden, 0.5);
  expect(fading).toMatchObject({ shown: 0.5, sparks: ONE_SPARK.sparks });
});

test('the hidden state draws, with no spark, at no opacity', () => {
  expect(REGROUP_SPARKS_PROP.shapesOf(REGROUP_SPARKS_PROP.hidden, { facing: -1, holdingHand: null })).toEqual({ opacity: 0, shapes: [] });
});
