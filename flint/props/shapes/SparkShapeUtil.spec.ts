/**
 * The sparks of the shared vocabulary. What matters: a Watcher's spark is a square of 4 turned 45 degrees around its centre with a light
 * core of 1.6; a dim one is dark and a dead one grey, both with no core; a spark scales around its centre; a small spark is a square of 2.5
 * placed at its point and turned around it, and Merge, a flame and a puff keep their own side and colour; a small spark that flies out goes
 * straight at its angle, turns half a turn and fades, unseen before and after its flight.
 */
import { expect, test } from 'bun:test';

import { SparkShapeUtil } from './SparkShapeUtil.ts';

test('a spark is a square of 4 and a core of 1.6, turned 45 degrees around its centre', () => {
  const [outer, core] = SparkShapeUtil.sparkOf({ key: 'spark', centreX: 40, centreY: -40 });
  expect(outer).toMatchObject({
    x: 38, y: -42, width: 4, height: 4, fill: 'body', transform: [{ rotateDegrees: 45, aboutX: 40, aboutY: -40 }],
  });
  expect(core).toMatchObject({
    x: 39.2, y: -40.8, width: 1.6, height: 1.6, fill: 'emberLight',
  });
});

test('a dim spark is dark and a dead spark grey, and neither has a core', () => {
  expect(SparkShapeUtil.sparkOf({
    key: 'spark', centreX: 0, centreY: 0, look: 'dim',
  }).map((shape) => shape.fill)).toEqual(['emberDark']);
  expect(SparkShapeUtil.sparkOf({
    key: 'spark', centreX: 0, centreY: 0, look: 'dead',
  }).map((shape) => shape.fill)).toEqual(['paperEdge']);
});

test('a spark scales around its own centre', () => {
  const [outer] = SparkShapeUtil.sparkOf({
    key: 'spark', centreX: 40, centreY: -40, scale: 0.5,
  });
  expect(outer?.transform).toEqual([
    { translateX: 40, translateY: -40 },
    { scaleX: 0.5, scaleY: 0.5 },
    { translateX: -40, translateY: 40 },
    { rotateDegrees: 45, aboutX: 40, aboutY: -40 },
  ]);
});

test('a small spark is a square of 2.5 placed and turned at its point; a side can be given', () => {
  expect(SparkShapeUtil.smallSparkOf({
    key: 'spark', x: 20, y: -24, turnDegrees: 90, opacity: 0.5,
  })).toEqual({
    kind:      'rectangle',
    key:       'spark',
    x:         -1.25,
    y:         -1.25,
    width:     2.5,
    height:    2.5,
    fill:      'body',
    opacity:   0.5,
    transform: [{ translateX: 20, translateY: -24 }, { rotateDegrees: 90 }],
  });
  expect(SparkShapeUtil.smallSparkOf({
    key: 'spark', x: 0, y: 0, turnDegrees: 0, opacity: 1, sideUnits: 3, fill: 'emberLight',
  })).toMatchObject({ width: 3, height: 3, fill: 'emberLight' });
});

test('a flying small spark goes straight out at its angle, turns half a turn and fades, unseen before and after', () => {
  const flight = (value: number) => SparkShapeUtil.flyingSparkPlaceOf({
    origin: { x: 46, y: -12 }, angleDegrees: -90, travelUnits: 8, flight: value,
  });
  expect(flight(0.5)).toEqual({
    x: 46, y: -16, turnDegrees: 90, opacity: 0.5,
  });
  expect([flight(-0.1).opacity, flight(0).opacity, flight(1).opacity]).toEqual([0, 0, 0]);
  expect(flight(2)).toMatchObject({ y: -20, turnDegrees: 180 });
});
