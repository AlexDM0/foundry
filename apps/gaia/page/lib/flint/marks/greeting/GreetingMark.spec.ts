/** The greeting mark. What matters: its anchor and scale, and the shapes it draws, in their order. */
import { expect, test } from 'bun:test';

import { GREETING_MARK } from './GreetingMark.ts';

test('it sits at (38, -49.5) at scale 1.3, and draws its shapes', () => {
  expect([GREETING_MARK.name, GREETING_MARK.anchorX, GREETING_MARK.anchorY, GREETING_MARK.scale]).toEqual(['greeting', 38, -49.5, 1.3]);
  expect(GREETING_MARK.shapesOf(GREETING_MARK.restDetails).map((shape) => shape.key)).toEqual(['text']);
});
