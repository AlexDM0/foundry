/**
 * A decision card's answer. What matters: an answer is only sendable whole, one letter per single-select question and the sorted letters of
 * a multi-select, and free text answers only a decision of one question; a click takes a single-select option alone and toggles a
 * multi-select one, leaving the other questions' choices as they were.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDecisionDocument } from '../../@types/board/BoardDecisionDocuments.ts';
import { DecisionAnswerUtil }         from './DecisionAnswerUtil.ts';

const NO_DOCUMENT_QUESTION = { document: null, anchor: null, placement: null } as const;

function decisionOf(id: string, questions: BoardDecisionDocument['questions']): BoardDecisionDocument {
  const openedAt = '2026-10-29T20:00:00+01:00';
  return {
    id, kind: 'agent-question', ticketIds: ['042'], jobId: 'J3', askedBy: 'builder', questions, context: 'Example context', openedAt, ...NO_DOCUMENT_QUESTION,
  };
}

const ONE_QUESTION = [{
  question:    'Which store?',
  header:      'Store',
  multiSelect: false,
  options:     [
    {
      letter:           'a',
      label:            'Disk',
      description:      '',
      recommended:      false,
      touches:          [],
      tradeOff:         null,
      acceptanceEffect: null
    },
    {
      letter:           'b',
      label:            'Memory',
      description:      '',
      recommended:      false,
      touches:          [],
      tradeOff:         null,
      acceptanceEffect: null
    },
  ]
}];
const TWO_QUESTIONS = [
  ...ONE_QUESTION,
  {
    question:    'Which targets?',
    header:      'Targets',
    multiSelect: true,
    options:     [
      {
        letter:           'a',
        label:            'main',
        description:      '',
        recommended:      false,
        touches:          [],
        tradeOff:         null,
        acceptanceEffect: null
      },
      {
        letter:           'b',
        label:            'group',
        description:      '',
        recommended:      false,
        touches:          [],
        tradeOff:         null,
        acceptanceEffect: null
      },
      {
        letter:           'c',
        label:            'none',
        description:      '',
        recommended:      false,
        touches:          [],
        tradeOff:         null,
        acceptanceEffect: null
      },
    ],
  },
];

function questionsOf(id: string, questions: BoardDecisionDocument['questions']) {
  return DecisionAnswerUtil.questionViewsOf(decisionOf(id, questions));
}

describe('DecisionAnswerUtil.answerOf', () => {
  test('one option letter per single-select question and the sorted letters of a multi-select', () => {
    expect(DecisionAnswerUtil.answerOf(questionsOf('E5', TWO_QUESTIONS), [[1], [2, 0]], null)).toEqual({ form: 'letters', choices: ['b', 'ac'] });
  });

  test('the chosen free text answers a decision of one question, never one of several, and never empty', () => {
    expect(DecisionAnswerUtil.answerOf(questionsOf('E2', ONE_QUESTION), [], '  Use disk  ')).toEqual({ form: 'text', text: 'Use disk' });
    expect(DecisionAnswerUtil.answerOf(questionsOf('E2', ONE_QUESTION), [], ' ')).toBeNull();
    expect(DecisionAnswerUtil.answerOf(questionsOf('E5', TWO_QUESTIONS), [], 'Both')).toBeNull();
  });

  test('an unanswered question keeps the answer unsendable', () => {
    expect(DecisionAnswerUtil.answerOf(questionsOf('E5', TWO_QUESTIONS), [[0]], null)).toBeNull();
  });

  test('a chosen option is sent by the letter the forge gave it', () => {
    const lettered = ONE_QUESTION.map((question) => ({ ...question, options: question.options.map((option, index) => ({ ...option, letter: index === 0 ? 'x' : 'y' })) }));
    expect(DecisionAnswerUtil.answerOf(questionsOf('E2', lettered), [[1]], null)).toEqual({ form: 'letters', choices: ['y'] });
  });
});

describe('DecisionAnswerUtil.commandOf', () => {
  test('wraps an answer as the decision\'s decision-answer, and holds none while there is no answer', () => {
    const answer = { form: 'text', text: 'Use disk' } as const;
    expect(DecisionAnswerUtil.commandOf('E2', answer)).toMatchObject({ kind: 'decision-answer', decisionId: 'E2', answer });
    expect(DecisionAnswerUtil.commandOf('E2', null)).toBeNull();
  });
});

describe('DecisionAnswerUtil.optionLetterOf', () => {
  test('the options are lettered from a', () => {
    expect([0, 1, 2].map(DecisionAnswerUtil.optionLetterOf)).toEqual(['a', 'b', 'c']);
  });
});

describe('DecisionAnswerUtil.selectionsAfter', () => {
  test('a click on a single-select option takes it alone, and the other questions keep their choices', () => {
    expect(DecisionAnswerUtil.selectionsAfter([[0], [1]], 0, 1, false)).toEqual([[1], [1]]);
  });

  test('a click on a multi-select option adds it, and a second click takes it away', () => {
    const added = DecisionAnswerUtil.selectionsAfter([[0]], 1, 2, true);
    expect(added).toEqual([[0], [2]]);
    expect(DecisionAnswerUtil.selectionsAfter(added, 1, 2, true)).toEqual([[0], []]);
  });
});
