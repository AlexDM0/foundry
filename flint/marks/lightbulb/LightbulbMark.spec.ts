/** The lightbulb of `01-character.md`. What matters: the rays first, at the opacity of the details, then the glass and fitting in their gradients. */
import { expect, test } from 'bun:test';

import { LIGHTBULB_MARK } from './LightbulbMark.ts';

test('the rays show at their opacity, behind the glass, which fills with its gradient', () => {
  const shapes = LIGHTBULB_MARK.shapesOf({ raysOpacity: 0.35 });
  expect(shapes.map((shape) => shape.key)).toEqual(['rays', 'glass', 'first-band', 'second-band', 'contact']);
  expect(shapes[0]?.opacity).toBe(0.35);
  expect(shapes[1]?.fill).toEqual({ gradient: 'flint-bulb-glass' });
});
