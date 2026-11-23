/** The sweat beads. What matters: one drop for each bead of the details, at most three, placed, turned and faded. */
import { expect, test } from 'bun:test';

import { SWEAT_BEADS_MARK } from './SweatBeadsMark.ts';

test('each bead is placed, turned and faded as the details say', () => {
  const [bead] = SWEAT_BEADS_MARK.shapesOf({
    beads: [{
      x: -6, y: -2, turnDegrees: -40, opacity: 0.5,
    }],
  });
  expect(bead).toMatchObject({ fill: 'water', opacity: 0.5, transform: [{ translateX: -6, translateY: -2 }, { rotateDegrees: -40 }] });
  expect(SWEAT_BEADS_MARK.shapesOf(SWEAT_BEADS_MARK.restDetails)).toEqual([]);
});
