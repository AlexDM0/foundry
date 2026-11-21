/** The exclamation mark of `01-character.md`. What matters: its anchor and scale, and the shapes it draws, in their order. */
import { expect, test } from 'bun:test';

import { EXCLAMATION_MARK } from './ExclamationMark.ts';

test('it sits at (20, -54) at scale 1.5, and draws its shapes', () => {
  expect([EXCLAMATION_MARK.name, EXCLAMATION_MARK.anchorX, EXCLAMATION_MARK.anchorY, EXCLAMATION_MARK.scale]).toEqual(['exclamation', 20, -54, 1.5]);
  expect(EXCLAMATION_MARK.shapesOf(EXCLAMATION_MARK.restDetails).map((shape) => shape.key)).toEqual(['text']);
});
