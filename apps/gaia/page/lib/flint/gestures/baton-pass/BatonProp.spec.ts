/**
 * The baton of Baton pass. What matters: it is a bar 4 by 14 with corner radius 2 in the
 * light ember colour, a band of 3 in the body colour at each end, over a glow circle of radius 6 at 40%; it is placed by its centre and
 * turned around it; it fades with its levels; the hidden state draws.
 */
import { expect, test } from 'bun:test';

import type { BatonState } from './BatonProp.ts';
import { BATON_PROP }      from './BatonProp.ts';

const TOSSED: BatonState = {
  shown: 1, cycleOpacity: 0.5, centreX: 28, centreY: -50, turnDegrees: 90,
};

const drawingOf = (state: BatonState) => BATON_PROP.shapesOf(state, { facing: 1, holdingHand: null });

test('the glow, the bands and the light middle, back to front, around the centre', () => {
  expect(drawingOf(TOSSED).shapes).toEqual([
    {
      kind: 'circle', key: 'glow', centreX: 0, centreY: 0, radius: 6, fill: 'glow', opacity: 0.4,
    },
    {
      kind: 'rectangle', key: 'bands', x: -2, y: -7, width: 4, height: 14, cornerRadius: 2, fill: 'body',
    },
    {
      kind: 'rectangle', key: 'bar', x: -2, y: -4, width: 4, height: 8, fill: 'emberLight',
    },
  ]);
});

test('it is placed by its centre and turned around it, and fades with its levels', () => {
  expect(drawingOf(TOSSED).transform).toEqual([{ translateX: 28, translateY: -50 }, { rotateDegrees: 90 }]);
  expect(drawingOf(TOSSED).opacity).toBe(0.5);
  expect(drawingOf(BATON_PROP.hidden).opacity).toBe(0);
});
