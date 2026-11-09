/**
 * The read-only form a filing draft's Kanban card opens, as a model: its head and facts, its request in the user's own words, then its
 * question tree, each follow-up under the answer that raised it.
 */
import type { DraftQuestion }                                        from '../../../src/lib/tracker-model/@types/Draft.ts';
import type { DetailBoardState }                                     from '../../@types/DetailBoardState.ts';
import { DraftWordingUtil }                                          from '../../utils/DraftWordingUtil.ts';
import { DetailFactsModel, type DetailFactModel, type DetailFormat } from './DetailFactsModel.ts';

export const NO_QUESTION_TEXT = 'No question asked yet.';

const UNCLAIMED_TEXT = 'nobody';

const OPEN_ANSWER_TEXT = 'open';

export interface DraftOptionModel {
  readonly letter:        string;
  readonly text:          string;
  readonly isRecommended: boolean;
  readonly isChosen:      boolean;
}

export interface DraftQuestionModel {
  readonly id:         string;
  readonly question:   string;
  readonly context:    string;
  readonly isMultiple: boolean;
  readonly options:    readonly DraftOptionModel[];
  /** The chosen letters as the options read them, `a, c`, or the free-text answer; "open" while unanswered. */
  readonly answerText: string;
  readonly isOpen:     boolean;
  readonly followUps:  readonly DraftQuestionModel[];
}

export interface DraftDetailModel {
  readonly form:      'draft';
  readonly idText:    string;
  readonly title:     string;
  readonly stateWord: string;
  readonly facts:     readonly DetailFactModel[];
  readonly request:   string;
  readonly questions: readonly DraftQuestionModel[];
}

function chosenLettersOf(question: DraftQuestion): readonly string[] {
  return question.answer !== null && 'letters' in question.answer ? question.answer.letters : [];
}

function answerTextOf(question: DraftQuestion): string {
  const { answer } = question;
  if (answer === null) return OPEN_ANSWER_TEXT;
  return 'letters' in answer ? answer.letters.join(', ') : answer.text;
}

function questionModelOf(question: DraftQuestion): DraftQuestionModel {
  const chosen = chosenLettersOf(question);
  return {
    id:         question.id,
    question:   question.question,
    context:    question.context,
    isMultiple: question.multiple,
    options:    question.options.map((option) => ({
      letter: option.letter, text: option.text, isRecommended: question.recommended.includes(option.letter), isChosen: chosen.includes(option.letter)
    })),
    answerText: answerTextOf(question),
    isOpen:     question.answer === null,
    followUps:  question.followUps.map(questionModelOf),
  };
}

/** `null` when the board holds no open draft of that id. */
function draftDetailModelOf(state: DetailBoardState, draftId: string, format: DetailFormat): DraftDetailModel | null {
  const { payload } = state.page;
  const draft = (payload.boardFacts.drafts ?? []).find((candidate) => candidate.id === draftId);
  if (draft === undefined) return null;
  return {
    form:      'draft',
    idText:    draft.id,
    title:     draft.title,
    stateWord: DraftWordingUtil.stateWordOf(draft.state),
    facts:     [
      ...DetailFactsModel.textFactsOf([['claimed by', draft.claimOwner ?? UNCLAIMED_TEXT]]),
      ...DetailFactsModel.stampFactsOf([['opened', draft.openedAt]], format),
      ...DetailFactsModel.textFactsOf([['waiting on you', draft.openQuestionCount === 0 ? undefined : DraftWordingUtil.openQuestionCountTextOf(draft.openQuestionCount)]]),
    ],
    request:   (payload.draftRequests ?? []).find((candidate) => candidate.id === draftId)?.request ?? '',
    questions: draft.questions.map(questionModelOf),
  };
}

export const DraftDetailModelUtil = Object.freeze({ draftDetailModelOf, answerTextOf });
