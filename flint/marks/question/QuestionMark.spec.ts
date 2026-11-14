/** The question mark of `01-character.md`. What matters: its anchor and scale, and the shapes it draws, in their order. */
import { expect, test } from 'bun:test';

import { QUESTION_MARK } from './QuestionMark.ts';

test('it sits at (20, -54) at scale 1.5, and draws its shapes', () => {
  expect([QUESTION_MARK.name, QUESTION_MARK.anchorX, QUESTION_MARK.anchorY, QUESTION_MARK.scale]).toEqual(['question', 20, -54, 1.5]);
  expect(QUESTION_MARK.shapesOf(QUESTION_MARK.restDetails).map((shape) => shape.key)).toEqual(['text']);
});
