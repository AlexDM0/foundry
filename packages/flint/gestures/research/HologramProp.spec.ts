/** The hologram. What matters: its opacity is its level times its flicker, and its scan line is where the state puts it. */
import { expect, test } from 'bun:test';

import { HOLOGRAM_PROP } from './HologramProp.ts';

test('the emitter, the beams, the panel, the text and the scan line, flickering', () => {
  const drawing = HOLOGRAM_PROP.shapesOf({ shown: 0.5, flicker: 0.9, scanLineY: -40 }, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['emitter', 'beams', 'panel', 'text', 'scan-line']);
  expect(drawing.opacity).toBeCloseTo(0.45, 9);
  expect(drawing.shapes[4]).toMatchObject({ y: -40, fill: 'waterLight' });
});
