/** The draft words: each state has its word, and the open questions are counted in the singular for one. */
import { describe, expect, test } from 'bun:test';

import { DraftWordsUtil } from './DraftWordsUtil.ts';

describe('a draft\'s words', () => {
  test('name each state', () => {
    expect([DraftWordsUtil.stateWordOf('researching'), DraftWordsUtil.stateWordOf('waiting'), DraftWordsUtil.stateWordOf('resumable')])
      .toEqual(['Researching', 'Waiting on you', 'Ready to resume']);
  });

  test('count one open question in the singular and more in the plural', () => {
    expect([DraftWordsUtil.openQuestionCountTextOf(1), DraftWordsUtil.openQuestionCountTextOf(3)]).toEqual(['1 open question', '3 open questions']);
  });
});
