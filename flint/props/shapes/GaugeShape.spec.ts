/** The gauge of the shared vocabulary. What matters: a box of 6 by 24, and a level bar 4 wide and 22 × level high from its bottom. */
import { expect, test } from 'bun:test';

import { gaugeShapesOf } from './GaugeShape.ts';

test('the box, and the level from the bottom', () => {
  const [box, level] = gaugeShapesOf({
    key: 'gauge', x: 32, y: -40, level: 0.5, levelColour: 'alarm',
  });
  expect(box).toMatchObject({
    x: 32, y: -40, width: 6, height: 24, cornerRadius: 1.5, fill: 'paper', stroke: 'graphite', strokeWidth: 1.4,
  });
  expect(level).toMatchObject({
    x: 33, y: -28, width: 4, height: 11, fill: 'alarm',
  });
});
