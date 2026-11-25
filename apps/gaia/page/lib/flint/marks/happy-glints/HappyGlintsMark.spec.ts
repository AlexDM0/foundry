/** The happy-glints mark. What matters: its anchor and scale, and the shapes it draws, in their order. */
import { expect, test } from 'bun:test';

import { HAPPY_GLINTS_MARK } from './HappyGlintsMark.ts';

test('it sits at (20, -45) at scale 1.5, lower than the shared anchor,, and draws its shapes', () => {
  expect([HAPPY_GLINTS_MARK.name, HAPPY_GLINTS_MARK.anchorX, HAPPY_GLINTS_MARK.anchorY, HAPPY_GLINTS_MARK.scale]).toEqual(['happy-glints', 20, -45, 1.5]);
  expect(HAPPY_GLINTS_MARK.shapesOf(HAPPY_GLINTS_MARK.restDetails).map((shape) => shape.key)).toEqual(['large-glint', 'small-glint']);
});
