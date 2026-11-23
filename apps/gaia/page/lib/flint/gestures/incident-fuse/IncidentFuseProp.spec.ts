/**
 * The props of Incident fuse. What matters: the envelope of the shared vocabulary at
 * (30, -22); the graphite fuse of width 1.4 that has not burned, gone at a full burn; the flame, a small spark of 3 with a light core of
 * 1.5, both scaled by its pulse, at the end of the fuse; the three grey puffs of 2 that drift 6 apart and fade; the seal of the stamp on
 * the envelope's seal; the jolt moves the whole drawing; the hidden state draws.
 */
import { expect, test } from 'bun:test';

import type { Shape }             from '../../drawing/Shape.ts';
import { FusePathUtil }           from './FusePathUtil.ts';
import type { IncidentFuseState } from './IncidentFuseProp.ts';
import { INCIDENT_FUSE_PROP }     from './IncidentFuseProp.ts';

const BURNING: IncidentFuseState = {
  shown: 1, cycleOpacity: 1, burn: 0.5, flameScale: 1.2, smokeProgress: 0, sealShown: false, offsetY: 0,
};

const shapesOf = (state: IncidentFuseState): readonly Shape[] => INCIDENT_FUSE_PROP.shapesOf(state, { facing: 1, holdingHand: null }).shapes;
const shapeOf = (state: IncidentFuseState, key: string) => shapesOf(state).find((shape) => shape.key === key);

test('the envelope of the vocabulary sits at (30, -22)', () => {
  expect(shapeOf(BURNING, 'envelope')).toMatchObject({
    kind: 'rectangle', x: 30, y: -22, width: 14, height: 9, stroke: 'alarm',
  });
});

test('the fuse that has not burned is graphite, 1.4 wide; at a full burn it is gone', () => {
  expect(shapeOf(BURNING, 'fuse')).toMatchObject({
    kind: 'path', pathData: FusePathUtil.unburnedPathOf(0.5), stroke: 'graphite', strokeWidth: 1.4, fill: 'none', opacity: 1,
  });
  expect(shapeOf({ ...BURNING, burn: 1 }, 'fuse')?.opacity).toBe(0);
});

test('the flame is a spark of 3 with a light core of 1.5, scaled by its pulse, at the end of the fuse', () => {
  const flamePoint = FusePathUtil.flamePointOf(0.5);
  expect(shapeOf(BURNING, 'flame')).toMatchObject({
    width: expect.closeTo(3.6, 5), fill: 'body', opacity: 1, transform: [{ translateX: flamePoint.x, translateY: flamePoint.y }, { rotateDegrees: 45 }],
  });
  expect(shapeOf(BURNING, 'flame-core')).toMatchObject({ width: expect.closeTo(1.8, 5), fill: 'emberLight' });
  expect(shapeOf({ ...BURNING, flameScale: 0 }, 'flame')?.opacity).toBe(0);
});

test('three grey puffs of 2 drift 6 apart from the envelope corner and fade', () => {
  const smoking = {
    ...BURNING, burn: 1, flameScale: 0, smokeProgress: 0.5
  };
  const puffs = [0, 1, 2].map((i) => shapeOf(smoking, `smoke-${i}`));
  expect(puffs.map((puff) => [puff?.fill, puff?.opacity, puff?.kind === 'rectangle' ? puff.width : 0])).toEqual([
    ['thinking', 0.5, 2], ['thinking', 0.5, 2], ['thinking', 0.5, 2],
  ]);
  expect(puffs[1]?.transform?.[0]).toEqual({ translateX: 44, translateY: -25 });
  expect(shapeOf({ ...smoking, smokeProgress: 0 }, 'smoke-0')?.opacity).toBe(0);
});

test('the seal of the stamp is a body-colour square of 4, turned 45 degrees, on the envelope seal; the jolt moves the drawing', () => {
  expect(shapeOf({ ...BURNING, sealShown: true }, 'seal')).toMatchObject({
    x: 35, y: -19, width: 4, height: 4, fill: 'body', opacity: 1,
  });
  expect(shapeOf(BURNING, 'seal')?.opacity).toBe(0);
  expect(INCIDENT_FUSE_PROP.shapesOf({ ...BURNING, offsetY: 1.5 }, { facing: 1, holdingHand: null }).transform).toEqual([{ translateX: 0, translateY: 1.5 }]);
});

test('the hidden state draws, at no opacity', () => {
  expect(INCIDENT_FUSE_PROP.shapesOf(INCIDENT_FUSE_PROP.hidden, { facing: -1, holdingHand: null }).opacity).toBe(0);
});
