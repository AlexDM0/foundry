/**
 * The jar of Bug jar. What matters: the bug is drawn before the glass so the glass tints it inside; the rim sits on the jar's top edge and
 * the open lid 6 above it; the jar and the bug shrink around the jar's centre; the low ticket is a mini sheet with a crimson dot; and a
 * hand held to the prop pinches the bug from 6 to its side.
 */
import { expect, test } from 'bun:test';

import { BUG_JAR_PROP } from './BugJarProp.ts';

const DRAWN = {
  ...BUG_JAR_PROP.hidden,
  shown:         1,
  bugX:          44,
  bugY:          -22,
  bugOpacity:    1,
  jarOpacity:    1,
  jarScale:      0.5,
  ticketOpacity: 0.25,
  ticketOffsetX: 6,
  ticketOffsetY: -2,
};

test('the bug, then the glass, the rim and the lid, then the ticket and its dot', () => {
  const keys = BUG_JAR_PROP.shapesOf(DRAWN, { facing: 1, holdingHand: null }).shapes.map((shape) => shape.key);
  expect(keys).toEqual(['bug-leg-0', 'bug-leg-1', 'bug-leg-2', 'bug-leg-3', 'bug', 'jar', 'rim', 'lid', 'ticket', 'ticket-dot']);
});

test('the jar at (39, -18), 10 by 12, its rim on its top edge, and the open lid 6 above the rim; closed, the lid sits on it', () => {
  const { shapes } = BUG_JAR_PROP.shapesOf(DRAWN, { facing: 1, holdingHand: null });
  expect(shapes.find((shape) => shape.key === 'jar')).toMatchObject({
    x: 39, y: -18, width: 10, height: 12, cornerRadius: 2, fill: 'waterLight', fillOpacity: 0.35, stroke: 'water', strokeWidth: 1.2,
  });
  expect(shapes.find((shape) => shape.key === 'rim')).toMatchObject({
    x: 38.5, y: -19, width: 11, height: 2, fill: 'graphite'
  });
  expect(shapes.find((shape) => shape.key === 'lid')).toMatchObject({
    x: 38.5, y: -27.2, width: 11, height: 2.2
  });
  const closed = BUG_JAR_PROP.shapesOf({ ...DRAWN, lidLift: 0 }, { facing: 1, holdingHand: null }).shapes;
  expect(closed.find((shape) => shape.key === 'lid')).toMatchObject({ y: -21.2 });
});

test('the jar and the bug shrink around the centre of the jar, the bug after its own wiggle', () => {
  const { shapes } = BUG_JAR_PROP.shapesOf(DRAWN, { facing: 1, holdingHand: null });
  const shrink = [{ translateX: 44, translateY: -12 }, { scaleX: 0.5, scaleY: 0.5 }, { translateX: -44, translateY: 12 }];
  expect(shapes.find((shape) => shape.key === 'jar')?.transform).toEqual(shrink);
  expect(shapes.find((shape) => shape.key === 'bug')?.transform).toEqual([...shrink, { rotateDegrees: 0, aboutX: 44, aboutY: -22 }]);
});

test('the low ticket is a mini sheet at (44, -12) with a crimson dot, moved by its offset', () => {
  const { shapes } = BUG_JAR_PROP.shapesOf(DRAWN, { facing: 1, holdingHand: null });
  const transform = [{ translateX: 6, translateY: -2 }, { translateX: 44, translateY: -12 }, { scaleX: 0.55, scaleY: 0.55 }, { translateX: -38, translateY: 28 }];
  expect(shapes.find((shape) => shape.key === 'ticket')).toMatchObject({
    kind: 'polygon', fill: 'paper', opacity: 0.25, transform
  });
  expect(shapes.find((shape) => shape.key === 'ticket-dot')).toMatchObject({
    kind: 'circle', fill: 'alarm', opacity: 0.25, transform
  });
});

test('a held hand pinches the bug from its side', () => {
  expect(BUG_JAR_PROP.gripOf?.(DRAWN)).toEqual({ x: 38, y: -22 });
});

test('hidden, it draws nothing and its lid is open', () => {
  expect(BUG_JAR_PROP.shapesOf(BUG_JAR_PROP.hidden, { facing: 1, holdingHand: null }).opacity).toBe(0);
  expect(BUG_JAR_PROP.hidden.lidLift).toBe(6);
});
