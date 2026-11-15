/** The anger-vein mark of `01-character.md`. What matters: its anchor and scale, and the shapes it draws, in their order. */
import { expect, test } from 'bun:test';

import { ANGER_VEIN_MARK } from './AngerVeinMark.ts';

test('it sits at (18, -52) at scale 1.05, and draws its shapes', () => {
  expect([ANGER_VEIN_MARK.name, ANGER_VEIN_MARK.anchorX, ANGER_VEIN_MARK.anchorY, ANGER_VEIN_MARK.scale]).toEqual(['anger-vein', 18, -52, 1.05]);
  expect(ANGER_VEIN_MARK.shapesOf(ANGER_VEIN_MARK.restDetails).map((shape) => shape.key)).toEqual(['vein']);
});
