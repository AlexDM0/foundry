/**
 * The rail of Slots. What matters: the rail at (26, -22), 28 by 6; three rings of 3.4 at x 31, 40 and 49, y -30, each on a stem to the
 * rail, graphite when free, the body colour when lit and crimson while refusing, then also filled in crimson so it reads at half size; a
 * spark in each, scaled around its centre; the mini sheet last; and a held hand at the sheet's left edge.
 */
import { expect, test } from 'bun:test';

import { SLOT_RAIL_PROP } from './SlotRailProp.ts';

const DRAWN = {
  ...SLOT_RAIL_PROP.hidden,
  shown:        1,
  sceneOpacity: 1,
  sockets:      ['lit', 'refusing', 'free'] as const,
  sparks:       [{ y: -30, scale: 1.5, opacity: 1 }, { y: -40, scale: 1, opacity: 1 }, { y: -30, scale: 1, opacity: 0 }],
  sheetOpacity: 1,
  sheetX:       31,
  sheetY:       -42,
};
const SHAPES = SLOT_RAIL_PROP.shapesOf(DRAWN, { facing: 1, holdingHand: null }).shapes;

test('the rail, the stems and sockets, the sparks, then the sheet', () => {
  expect(SHAPES.map((shape) => shape.key)).toEqual([
    'rail',
    'stem-0',
    'socket-0',
    'stem-1',
    'socket-1',
    'stem-2',
    'socket-2',
    'spark-0',
    'spark-0-core',
    'spark-1',
    'spark-1-core',
    'spark-2',
    'spark-2-core',
    'sheet',
  ]);
  expect(SHAPES[0]).toMatchObject({
    x: 26, y: -22, width: 28, height: 6, cornerRadius: 3, fill: 'hardware', stroke: 'graphite', strokeWidth: 1.2,
  });
});

test('each ring sits on a stem down to the rail; its colour tells the state of the socket', () => {
  expect(SHAPES[1]).toMatchObject({
    x1: 31, y1: -26.6, x2: 31, y2: -22
  });
  expect(SHAPES.filter((shape) => shape.key.startsWith('socket-')).map((shape) => shape.stroke)).toEqual(['body', 'alarm', 'graphite']);
  expect(SHAPES.filter((shape) => shape.key.startsWith('socket-')).map((shape) => [shape.fill, shape.fillOpacity])).toEqual([
    ['none', undefined], ['alarm', 0.4], ['none', undefined],
  ]);
  expect(SHAPES[2]).toMatchObject({
    kind: 'circle', centreX: 31, centreY: -30, radius: 3.4, fill: 'none'
  });
});

test('a spark is scaled around its own centre, at its socket\'s x and its own height', () => {
  expect(SHAPES[7]?.transform).toEqual([
    { translateX: 31, translateY: -30 }, { scaleX: 1.5, scaleY: 1.5 }, { translateX: -31, translateY: 30 }, { rotateDegrees: 45, aboutX: 31, aboutY: -30 },
  ]);
  expect(SHAPES[9]).toMatchObject({ x: 38, y: -42 });
});

test('the sheet is a mini sheet at its centre, and a held hand sits at its left edge', () => {
  expect(SHAPES[13]).toMatchObject({ kind: 'polygon', transform: [{ translateX: 31, translateY: -42 }, { scaleX: 0.55, scaleY: 0.55 }, { translateX: -38, translateY: 28 }] });
  expect(SLOT_RAIL_PROP.gripOf?.(DRAWN)).toEqual({ x: 23, y: -40 });
});
