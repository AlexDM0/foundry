/**
 * The looking glass. What matters: its centre eases with the hand fraction while it shows and holds still while it hides; its grip is the
 * lens centre + (-8, 8); the handle runs from the edge of the lens to the hand that holds it, only while that hand is larger than 2; the
 * lens grows from scale 0 with its shown level, in front of the body.
 */
import { expect, test } from 'bun:test';

import { LOOKING_GLASS_PROP } from './LookingGlassProp.ts';

const HELD = { centreX: 30, centreY: -22, radius: 5 };

test('its centre eases while it shows, and holds while it fades', () => {
  const drawn = { shown: 1, centreX: 30, centreY: -30 };
  expect(LOOKING_GLASS_PROP.easedOf?.(drawn, { shown: 1, centreX: 40, centreY: -30 }, 0.5)).toEqual({ shown: 1, centreX: 35, centreY: -30 });
  expect(LOOKING_GLASS_PROP.easedOf?.(drawn, { ...LOOKING_GLASS_PROP.hidden }, 0.5)).toEqual({ shown: 0.5, centreX: 30, centreY: -30 });
});

test('a hand is held to the lens centre + (-8, 8)', () => {
  expect(LOOKING_GLASS_PROP.gripOf?.({ shown: 1, centreX: 38, centreY: -30 })).toEqual({ x: 30, y: -22 });
});

test('the handle runs from the lens edge to the holding hand, only while the hand is larger than 2', () => {
  const held = LOOKING_GLASS_PROP.shapesOf({ shown: 1, centreX: 38, centreY: -30 }, { facing: 1, holdingHand: HELD });
  expect(held.shapes.map((shape) => shape.key)).toEqual(['handle', 'lens']);
  const [handle] = held.shapes;
  expect(handle?.kind === 'line' ? [handle.x1, handle.y1, handle.x2, handle.y2] : []).toEqual([38 - (5.5 / Math.SQRT2), -30 + (5.5 / Math.SQRT2), 30, -22]);
  const smallHand = { facing: 1, holdingHand: { ...HELD, radius: 2 } } as const;
  expect(LOOKING_GLASS_PROP.shapesOf({ shown: 1, centreX: 38, centreY: -30 }, smallHand).shapes.map((shape) => shape.key)).toEqual(['lens']);
});

test('the lens grows from scale 0 with its level, in front of the body', () => {
  const [lens] = LOOKING_GLASS_PROP.shapesOf({ shown: 0.5, centreX: 38, centreY: -30 }, { facing: 1, holdingHand: null }).shapes;
  expect(lens).toMatchObject({ opacity: 0.5, transform: [{ translateX: 38, translateY: -30 }, { scaleX: 0.5, scaleY: 0.5 }] });
  expect(LOOKING_GLASS_PROP.layer).toBe('in-front-of-body');
});
