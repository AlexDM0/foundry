/**
 * The note of Gate failed. What matters: a paper rectangle of 10 by 12 with a crimson edge of 1.2 at x 30 and its top y; a small cross
 * centred on it, never mirrored; its fade multiplies its shown level.
 */
import { expect, test } from 'bun:test';

import { GATE_NOTE_PROP } from './GateNoteProp.ts';

test('a paper note with a crimson edge and a small cross at its centre, faded by its opacity', () => {
  const drawing = GATE_NOTE_PROP.shapesOf({ shown: 1, topY: -18, opacity: 0.5 }, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0.5);
  expect(drawing.shapes[0]).toMatchObject({
    kind: 'rectangle', x: 30, y: -18, width: 10, height: 12, fill: 'paper', stroke: 'alarm', strokeWidth: 1.2,
  });
  const cross = drawing.shapes[1];
  expect(cross).toMatchObject({ key: 'cross', stroke: 'alarm' });
  expect(cross?.unmirroredAboutX).toBeCloseTo(35);
  expect(cross?.transform?.[1]).toEqual({ scaleX: 0.45, scaleY: 0.45 });
});

test('its cross is centred on the note: the small cross starts half its side up and left of (35, -12), written to two decimals', () => {
  const cross = GATE_NOTE_PROP.shapesOf({ shown: 1, topY: -18, opacity: 1 }, { facing: -1, holdingHand: null }).shapes[1];
  expect(cross?.kind === 'path' ? cross.pathData : '').toBe('M33.42 -13.57 l7 7 M40.42 -13.57 l-7 7');
});
