/**
 * The sparks of the flare. What matters: one small spark of the shared vocabulary for each state given, at its place, turn and opacity;
 * four hidden ones to start.
 */
import { expect, test } from 'bun:test';

import { REFUEL_SPARKS_PROP } from './RefuelSparksProp.ts';

test('one small spark for each state, placed, turned and faded', () => {
  const drawing = REFUEL_SPARKS_PROP.shapesOf({
    shown:  1,
    sparks: [{
      x: 10, y: -30, turnDegrees: 90, opacity: 0.5
    }]
  }, { facing: 1, holdingHand: null });
  expect(drawing.shapes).toEqual([{
    kind:      'rectangle',
    key:       'spark-0',
    x:         -1.25,
    y:         -1.25,
    width:     2.5,
    height:    2.5,
    fill:      'body',
    opacity:   0.5,
    transform: [{ translateX: 10, translateY: -30 }, { rotateDegrees: 90 }],
  }]);
  expect(REFUEL_SPARKS_PROP.hidden.sparks).toHaveLength(4);
});
