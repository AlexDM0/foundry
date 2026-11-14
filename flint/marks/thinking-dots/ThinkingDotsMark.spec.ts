/** The thinking dots of `01-character.md`. What matters: three squares of 3, and the ones the details count show, from the left. */
import { expect, test } from 'bun:test';

import { THINKING_DOTS_MARK } from './ThinkingDotsMark.ts';

test('the dots the details count show, from the left', () => {
  expect(THINKING_DOTS_MARK.shapesOf({ dotsShown: 2 }).map((dot) => [dot.kind === 'rectangle' ? dot.x : null, dot.opacity])).toEqual([[-7, 1], [-1.5, 1], [4, 0]]);
  expect(THINKING_DOTS_MARK.restDetails).toEqual({ dotsShown: 0 });
});
