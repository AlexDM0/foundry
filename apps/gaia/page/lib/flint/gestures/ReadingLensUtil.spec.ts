/**
 * The reading lens. What matters: the lens starts at x 31 one unit below the line and travels 13 along it, down the line's slope; the eyes
 * lift 1.4 for each line from -2 and shift from 5 to 7 along it, so Review and Bug jar read alike.
 */
import { expect, test } from 'bun:test';

import { ReadingLensUtil } from './ReadingLensUtil.ts';

test('the lens is one unit below the line, along it on the screen', () => {
  expect(ReadingLensUtil.lensCentreOf(0, 0)).toEqual({ x: 31, y: -38 });
  expect(ReadingLensUtil.lensCentreOf(1, 1)).toEqual({ x: 44, y: -39 + 7 + 2.8 + 1 });
});

test('the eyes go down a line at a time and along the line', () => {
  expect(ReadingLensUtil.readingEyesOf(0, 0)).toEqual({ lift: -2, shift: 5 });
  expect(ReadingLensUtil.readingEyesOf(2, 0.5)).toEqual({ lift: -2 + 2.8, shift: 6 });
});
