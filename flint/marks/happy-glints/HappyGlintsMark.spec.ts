/** The happy-glints mark of `01-character.md`. What matters: its anchor and scale, and the shapes it draws, in their order. */
import { expect, test } from 'bun:test';

import { HAPPY_GLINTS_MARK } from './HappyGlintsMark.ts';

test('it sits at (20, -54) at scale 1.5, and draws its shapes', () => {
  expect([HAPPY_GLINTS_MARK.name, HAPPY_GLINTS_MARK.anchorX, HAPPY_GLINTS_MARK.anchorY, HAPPY_GLINTS_MARK.scale]).toEqual(['happy-glints', 20, -54, 1.5]);
  expect(HAPPY_GLINTS_MARK.shapesOf(HAPPY_GLINTS_MARK.restDetails).map((shape) => shape.key)).toEqual(['large-glint', 'small-glint']);
});
