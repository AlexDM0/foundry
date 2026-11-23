/** The sweat-drop mark. What matters: its anchor and scale, and the shapes it draws, in their order. */
import { expect, test } from 'bun:test';

import { SWEAT_DROP_MARK } from './SweatDropMark.ts';

test('it sits at (13, -48) at scale 1.45, and draws its shapes', () => {
  expect([SWEAT_DROP_MARK.name, SWEAT_DROP_MARK.anchorX, SWEAT_DROP_MARK.anchorY, SWEAT_DROP_MARK.scale]).toEqual(['sweat-drop', 13, -48, 1.45]);
  expect(SWEAT_DROP_MARK.shapesOf(SWEAT_DROP_MARK.restDetails).map((shape) => shape.key)).toEqual(['drop', 'highlight']);
});
