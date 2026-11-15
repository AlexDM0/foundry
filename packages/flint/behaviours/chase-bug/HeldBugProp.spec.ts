/**
 * The held bug of Chase the bug. What matters: it is the chase's bug at the scale and wiggle the state gives, drawn in front of the body
 * and behind the near hand; it takes the state the behaviour gives on each frame, with no lag behind the hands; and once the behaviour no
 * longer gives it, it fades where it was last drawn.
 */
import { expect, test } from 'bun:test';

import { ChasePageShapeUtil } from './ChasePageShapeUtil.ts';
import { HELD_BUG_PROP }      from './HeldBugProp.ts';

const HELD = {
  shown: 1, x: 30, y: -12, scale: 1.5, facing: -1, turnDegrees: 8,
} as const;

test('it is the chase\'s bug at the scale, the facing and the wiggle the state gives, in front of the body', () => {
  const drawing = HELD_BUG_PROP.shapesOf(HELD, { facing: 1, holdingHand: null });
  expect(drawing.shapes).toEqual(ChasePageShapeUtil.bugShapesOf({
    centre: { x: 30, y: -12 }, scale: 1.5, facing: -1, turnDegrees: 8,
  }));
  expect([drawing.opacity, HELD_BUG_PROP.layer]).toEqual([1, 'in-front-of-body']);
});

test('it takes the state the behaviour gives on each frame, with no lag', () => {
  expect(HELD_BUG_PROP.easedOf?.(HELD_BUG_PROP.hidden, HELD, 0.2)).toEqual(HELD);
});

test('once the behaviour no longer gives it, it fades where it was last drawn', () => {
  const fading = HELD_BUG_PROP.easedOf?.(HELD, HELD_BUG_PROP.hidden, 0.25);
  expect(fading).toEqual({ ...HELD, shown: 0.75 });
});
