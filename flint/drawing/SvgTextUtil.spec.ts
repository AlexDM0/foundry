/**
 * How a number, a transform, points and a paint are written. What matters: a number is rounded to two decimals with no negative zero, so
 * an attribute changes only when the drawing does; transform steps keep their order; a colour role is its custom property with the
 * palette's default, so a host can change it; a gradient is a reference to its id.
 */
import { expect, test } from 'bun:test';

import { SvgTextUtil } from './SvgTextUtil.ts';

test('a number has at most two decimals and no negative zero', () => {
  expect([SvgTextUtil.numberText(1.23456), SvgTextUtil.numberText(-0.001), SvgTextUtil.numberText(40)]).toEqual(['1.23', '0', '40']);
});

test('the steps of a transform keep their order, a turn around a point names it', () => {
  expect(SvgTextUtil.transformText([
    { translateX: 1.5, translateY: -2 },
    { rotateDegrees: 20, aboutX: 39, aboutY: -27 },
    { rotateDegrees: 45 },
    { scaleX: -1, scaleY: 1 },
  ])).toBe('translate(1.5 -2) rotate(20 39 -27) rotate(45) scale(-1 1)');
});

test('points are pairs separated by spaces', () => {
  expect(SvgTextUtil.pointsText([{ x: 28, y: -46 }, { x: 48.004, y: -42 }])).toBe('28,-46 48,-42');
});

test('a colour role is its custom property with the default, a gradient its reference, and none stays none', () => {
  expect(SvgTextUtil.paintText('husk')).toBe('var(--flint-husk, #f3c9a8)');
  expect(SvgTextUtil.paintText({ gradient: 'flint-bulb-glass' })).toBe('url(#flint-bulb-glass)');
  expect(SvgTextUtil.paintText('none')).toBe('none');
});
