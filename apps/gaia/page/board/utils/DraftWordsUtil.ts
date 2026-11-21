/** How the board words a filing draft: its state word and its open questions counted. The state itself is the forge's fact. */
import type { BoardDraftState } from '../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }        from '../../shared/utils/CountTextUtil.ts';

const DRAFT_STATE_WORD: Readonly<Record<BoardDraftState, string>> = {
  researching: 'Researching',
  waiting:     'Waiting on you',
  resumable:   'Ready to resume',
};

function stateWordOf(state: BoardDraftState): string {
  return DRAFT_STATE_WORD[state];
}

/** `1 open question`, `3 open questions`. */
function openQuestionCountTextOf(openQuestionCount: number): string {
  return CountTextUtil.countedPhrase(openQuestionCount, 'open question', 'open questions');
}

export const DraftWordsUtil = Object.freeze({ stateWordOf, openQuestionCountTextOf });
