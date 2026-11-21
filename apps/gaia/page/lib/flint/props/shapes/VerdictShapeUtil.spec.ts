/**
 * The tick and the cross of the shared vocabulary. What matters: each is drawn from its start point as `01-character.md` draws it; both
 * are never mirrored, so each is mirrored back about its own centre; a small one is the same shape scaled around its start point; and a
 * waived verdict is grey.
 */
import { expect, test } from 'bun:test';

import { VerdictShapeUtil } from './VerdictShapeUtil.ts';

test('the tick from its start point, never mirrored about its own centre', () => {
  expect(VerdictShapeUtil.tickOf({
    key: 'tick', startX: 40, startY: -52, opacity: 1,
  })).toMatchObject({
    pathData: 'M40 -52 l3 3 l6 -7', stroke: 'done', strokeWidth: 2.4, lineCap: 'round', lineJoin: 'round', unmirroredAboutX: 44.5,
  });
});

test('the cross from its start point, never mirrored about its own centre', () => {
  expect(VerdictShapeUtil.crossOf({
    key: 'cross', startX: 41, startY: -56, opacity: 1,
  })).toMatchObject({
    pathData: 'M41 -56 l7 7 M48 -56 l-7 7', stroke: 'alarm', strokeWidth: 2.2, unmirroredAboutX: 44.5,
  });
});

test('a small one is scaled around its start point', () => {
  const small = VerdictShapeUtil.tickOf({
    key: 'tick', startX: 10, startY: -20, opacity: 1, scale: 0.45,
  });
  expect(small.transform).toEqual([{ translateX: 10, translateY: -20 }, { scaleX: 0.45, scaleY: 0.45 }, { translateX: -10, translateY: 20 }]);
  expect(small.unmirroredAboutX).toBeCloseTo(10 + (4.5 * 0.45), 9);
});

test('a waived verdict is grey', () => {
  expect(VerdictShapeUtil.tickOf({
    key: 'tick', startX: 0, startY: 0, opacity: 1, colour: 'paperEdge',
  }).stroke).toBe('paperEdge');
  expect(VerdictShapeUtil.crossOf({
    key: 'cross', startX: 0, startY: 0, opacity: 1, colour: 'paperEdge',
  }).stroke).toBe('paperEdge');
});
