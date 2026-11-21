/**
 * The blueprint of Survey. What matters: the paper in the `water` colour at 25% with an outline of 1.2; two lines across and two down
 * at the thirds, at 60% and width 0.6; the top measure from (31, -38), 14 long with the paper's slope, growing from its left end on the
 * screen, with an end mark of 2 across it at each end; the side measure at x 30 from -34 to -18, clear of post 0; and the posts on their sloped line, each
 * with the shared lamp of radius 2.2 on top.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }                       from '../../SpriteGeometry.ts';
import type { Shape }                        from '../../drawing/Shape.ts';
import { SURVEY_BLUEPRINT_PROP, postBaseOf } from './SurveyBlueprintProp.ts';

const DRAWN = {
  ...SURVEY_BLUEPRINT_PROP.hidden,
  shown:        1,
  sceneOpacity: 1,
  topMeasure:   0.5,
  sideMeasure:  1,
  posts:        [{ growth: 1, lampOpacity: 1, lamp: 'passed' }, { growth: 0.5, lampOpacity: 0, lamp: 'off' }, { growth: 0, lampOpacity: 0, lamp: 'off' }] as const,
};

function shapeOf(key: string, facing: Facing = 1): Shape | undefined {
  return SURVEY_BLUEPRINT_PROP.shapesOf(DRAWN, { facing, holdingHand: null }).shapes.find((shape) => shape.key === key);
}

test('the blueprint is the paper in the water colour, with a grid of thirds', () => {
  expect(shapeOf('blueprint')).toMatchObject({
    kind: 'polygon', fill: 'water', fillOpacity: 0.25, stroke: 'water', strokeWidth: 1.2,
  });
  expect(shapeOf('across-0')).toMatchObject({
    x1: 28, x2: 48, stroke: 'water', strokeWidth: 0.6, strokeOpacity: 0.6
  });
  expect(shapeOf('across-0')).toMatchObject({ y1: -46 + (32 / 3) });
  expect(shapeOf('down-1')).toMatchObject({ x1: expect.closeTo(28 + (40 / 3)), x2: expect.closeTo(28 + (40 / 3)) });
});

describe('the top measure', () => {
  test('facing right it grows from (31, -38) with the paper\'s slope, marked at both ends across the line', () => {
    expect(shapeOf('top-measure')).toMatchObject({
      x1: 31, y1: -38, x2: 38, y2: -36.6, stroke: 'graphite', strokeWidth: 1.2
    });
    const mark = shapeOf('top-measure-end');
    if (mark?.kind !== 'line') throw new Error('an end mark is a line');
    expect(Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1)).toBeCloseTo(2);
    expect(((mark.x2 - mark.x1) * 1) + ((mark.y2 - mark.y1) * 0.2)).toBeCloseTo(0);
    expect((mark.x1 + mark.x2) / 2).toBeCloseTo(38);
  });

  test('facing left it grows from the end that is left on the screen, its far end in Flint\'s own terms', () => {
    expect(shapeOf('top-measure', -1)).toMatchObject({ x1: 45, x2: 38 });
    const startMark = shapeOf('top-measure-start', -1);
    if (startMark?.kind !== 'line') throw new Error('an end mark is a line');
    expect((startMark.x1 + startMark.x2) / 2).toBeCloseTo(45);
  });
});

test('the side measure runs at x 30 from -34 down to -18, marked across at both ends', () => {
  expect(shapeOf('side-measure')).toMatchObject({
    x1: 30, y1: -34, x2: 30, y2: -18
  });
  expect(shapeOf('side-measure-end')).toMatchObject({
    x1: 29, y1: -18, x2: 31, y2: -18
  });
});

test('the posts stand on the line y = -20 + 0.2 × (x - 31) and grow to 5; each lamp of 2.2 sits on top', () => {
  expect(postBaseOf(43)).toEqual({ x: 43, y: -20 + (0.2 * 12) });
  expect(shapeOf('post-1')).toMatchObject({
    x1: 38, y1: -18.6, x2: 38, y2: -21.1
  });
  expect(shapeOf('post-2')?.opacity).toBe(0);
  const lamp = shapeOf('lamp-0');
  expect(lamp).toMatchObject({
    kind: 'circle', centreX: 33, centreY: expect.closeTo(-26.8), radius: 2.2, fill: 'done',
  });
  expect(lamp?.opacity ?? 1).toBe(1);
  expect(lamp?.transform).toBeUndefined();
});
