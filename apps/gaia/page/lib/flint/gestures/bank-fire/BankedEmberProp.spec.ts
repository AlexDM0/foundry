/**
 * The banked ember. What matters: a square of 2.5 in the colour of Sleep's ember 2, placed and turned around its corner as Sleep's embers
 * are, and never mirrored: facing left it is mirrored back about x 0, so its place on the screen is the same.
 */
import { expect, test } from 'bun:test';

import { BANKED_EMBER_PROP } from './BankedEmberProp.ts';

test('a square of 2.5 in the dark ember colour, placed, turned and faded, mirrored back about x 0', () => {
  const drawing = BANKED_EMBER_PROP.shapesOf({
    shown: 1,
    ember: {
      x: 12, y: -50, turnDegrees: 60, opacity: 0.8,
    },
  }, { facing: -1, holdingHand: null });
  expect(drawing.shapes).toEqual([{
    kind:             'rectangle',
    key:              'ember',
    x:                0,
    y:                0,
    width:            2.5,
    height:           2.5,
    fill:             'emberDark',
    opacity:          0.8,
    unmirroredAboutX: 0,
    transform:        [{ translateX: 12, translateY: -50 }, { rotateDegrees: 60 }],
  }]);
});
