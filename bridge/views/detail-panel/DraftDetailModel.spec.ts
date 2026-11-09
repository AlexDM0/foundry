/**
 * The draft form. What matters: an unclaimed draft says who holds it (nobody), the open questions are counted only while any is open, the
 * request is the user's own words joined by id, and the question tree keeps each follow-up under its question with the recommended and
 * chosen options marked and the answer read as the options read it, or "open".
 */
import { describe, expect, test } from 'bun:test';

import type { DraftQuestion }                                        from '../../../src/lib/tracker-model/@types/Draft.ts';
import { EXAMPLE_DETAIL_FORMAT, exampleDetailBoard, exampleStampAt } from '../../testing/DetailBoardFixture.ts';
import { DraftDetailModelUtil }                                      from './DraftDetailModel.ts';

const FOLLOW_UP: DraftQuestion = {
  id:          'Q2',
  question:    'Which example vendor?',
  context:     '',
  options:     [],
  multiple:    false,
  recommended: [],
  answer:      { text: 'Example Agency', answeredAt: exampleStampAt('10:00') },
  followUps:   [],
};

const QUESTION: DraftQuestion = {
  id:          'Q1',
  question:    'Which pages change?',
  context:     'The account area has four pages.',
  options:     [{ letter: 'a', text: 'Orders' }, { letter: 'b', text: 'Addresses' }, { letter: 'c', text: 'Payment methods' }],
  multiple:    true,
  recommended: ['a', 'b'],
  answer:      { letters: ['a', 'c'], answeredAt: exampleStampAt('09:45') },
  followUps:   [FOLLOW_UP],
};

const BOARD = exampleDetailBoard({
  tickets: [],
  drafts:  [
    {
      id:                'D7',
      title:             'Example dark mode',
      claimOwner:        null,
      openedAt:          exampleStampAt('09:30'),
      state:             'waiting',
      openQuestionCount: 1,
      questions:         [QUESTION, { ...FOLLOW_UP, id: 'Q3', answer: null }],
    },
  ],
  draftRequests: [{ id: 'D7', request: 'The account pages\nshould follow the system theme.' }],
});

test('the head, facts and request', () => {
  const model = DraftDetailModelUtil.draftDetailModelOf(BOARD, 'D7', EXAMPLE_DETAIL_FORMAT);
  expect([model?.idText, model?.title, model?.stateWord]).toEqual(['D7', 'Example dark mode', 'Waiting on you']);
  expect(model?.request).toBe('The account pages\nshould follow the system theme.');
  expect(model?.facts).toEqual([
    { kind: 'text', label: 'claimed by', text: 'nobody' },
    { kind: 'stamp', label: 'opened', stamp: { shortText: '09:30', fullText: '2026-09-18 09:30' } },
    { kind: 'text', label: 'waiting on you', text: '1 open question' },
  ]);
});

describe('the question tree', () => {
  const questions = DraftDetailModelUtil.draftDetailModelOf(BOARD, 'D7', EXAMPLE_DETAIL_FORMAT)?.questions ?? [];

  test('marks the recommended and chosen options and reads the answer as the options do', () => {
    expect(questions[0]?.options.map((option) => [option.letter, option.isRecommended, option.isChosen])).toEqual([
      ['a', true, true],
      ['b', true, false],
      ['c', false, true],
    ]);
    expect([questions[0]?.answerText, questions[0]?.isMultiple, questions[0]?.isOpen]).toEqual(['a, c', true, false]);
  });

  test('keeps a follow-up under its question, a free-text answer as written, and an open one as open', () => {
    expect(questions[0]?.followUps.map((followUp) => [followUp.id, followUp.answerText])).toEqual([['Q2', 'Example Agency']]);
    expect([questions[1]?.answerText, questions[1]?.isOpen]).toEqual(['open', true]);
  });
});

test('an unknown draft has no draft form', () => {
  expect(DraftDetailModelUtil.draftDetailModelOf(BOARD, 'D9', EXAMPLE_DETAIL_FORMAT)).toBeNull();
});
