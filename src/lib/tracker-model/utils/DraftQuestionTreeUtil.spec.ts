/**
 * A draft's question tree and how an answer's text reads. What matters: the walk is depth first with parents before their follow-ups;
 * open questions come in number order wherever they sit, `Q10` after `Q9`; a removal takes a nested question with its follow-ups and
 * leaves the tree untouched for an unknown id; and an answer reads as letters only when every part is an option letter, else as free text.
 */
import { describe, expect, test } from 'bun:test';

import type { DraftQuestion }    from '../@types/Draft.ts';
import { DraftQuestionTreeUtil } from './DraftQuestionTreeUtil.ts';

const {
  everyQuestionIn,
  questionById,
  openQuestionIdsOf,
  removeQuestion,
  optionLettersIn,
} = DraftQuestionTreeUtil;

const ANSWERED = { letters: ['a'], answeredAt: '2026-10-28T10:00:00+01:00' };

function questionOf(id: string, followUps: DraftQuestion[] = [], answered = false): DraftQuestion {
  return {
    id,
    question:    `Example question ${id}?`,
    context:     '',
    options:     [{ letter: 'a', text: 'Example option' }, { letter: 'b', text: 'Another example option' }],
    multiple:    false,
    recommended: ['a'],
    answer:      answered ? ANSWERED : null,
    followUps,
  };
}

function exampleTree(): DraftQuestion[] {
  return [
    questionOf('Q1', [questionOf('Q10', [questionOf('Q11')]), questionOf('Q2', [], true)]),
    questionOf('Q9'),
  ];
}

function idsOf(questions: readonly DraftQuestion[]): string[] {
  return questions.map((question) => question.id);
}

describe('everyQuestionIn', () => {
  test('walks depth first, each parent before its follow-ups', () => {
    expect(idsOf(everyQuestionIn(exampleTree()))).toEqual(['Q1', 'Q10', 'Q11', 'Q2', 'Q9']);
  });
});

describe('questionById', () => {
  test('finds a question nested under follow-ups', () => {
    expect(questionById(exampleTree(), 'Q11')?.id).toBe('Q11');
  });

  test('finds nothing for an id the tree does not hold', () => {
    expect(questionById(exampleTree(), 'Q12')).toBeUndefined();
  });
});

describe('openQuestionIdsOf', () => {
  test('lists the unanswered questions in number order, not tree or text order', () => {
    expect(openQuestionIdsOf(exampleTree())).toEqual(['Q1', 'Q9', 'Q10', 'Q11']);
  });
});

describe('removeQuestion', () => {
  test('removes a nested question together with its follow-ups and returns it', () => {
    const tree    = exampleTree();
    const removed = removeQuestion(tree, 'Q10');
    expect(removed?.id).toBe('Q10');
    expect(idsOf(removed?.followUps ?? [])).toEqual(['Q11']);
    expect(idsOf(everyQuestionIn(tree))).toEqual(['Q1', 'Q2', 'Q9']);
  });

  test('removes a top-level question', () => {
    const tree = exampleTree();
    expect(removeQuestion(tree, 'Q9')?.id).toBe('Q9');
    expect(idsOf(tree)).toEqual(['Q1']);
  });

  test('returns nothing and leaves the tree as it was for an unknown id', () => {
    const tree = exampleTree();
    expect(removeQuestion(tree, 'Q12')).toBeUndefined();
    expect(tree).toEqual(exampleTree());
  });
});

describe('optionLettersIn', () => {
  test('reads a comma-separated letter list, trimmed, duplicates dropped, in the order given', () => {
    expect(optionLettersIn('b, a ,b')).toEqual(['b', 'a']);
  });

  test('reads any letter an option can have, leaving a letter past the options for the caller to refuse', () => {
    expect(optionLettersIn('d')).toEqual(['d']);
  });

  test('reads anything else as free text', () => {
    for (const text of ['e', 'A', 'a b', 'a,', 'a, yes', '', 'Use the example option']) expect(optionLettersIn(text), text).toBeNull();
  });
});
