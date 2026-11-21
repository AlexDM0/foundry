/**
 * The read-only form a filing draft's Kanban card opens, as a model: its head and facts, its request in the user's own words, then its
 * question tree, each follow-up under the answer that raised it.
 */
import type { BoardDocument }                                        from '../../../@types/board/BoardDocument.ts';
import type { BoardDraftQuestionDocument }                           from '../../../@types/board/BoardTicketDocuments.ts';
import { DraftWordsUtil }                                            from '../../utils/DraftWordsUtil.ts';
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

function chosenLettersOf(question: BoardDraftQuestionDocument): readonly string[] {
  return question.answer?.form === 'letters' ? question.answer.letters : [];
}

function answerTextOf(question: BoardDraftQuestionDocument): string {
  const { answer } = question;
  if (answer === null) return OPEN_ANSWER_TEXT;
  return answer.form === 'letters' ? answer.letters.join(', ') : answer.text;
}

function questionModelOf(question: BoardDraftQuestionDocument): DraftQuestionModel {
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
function draftDetailModelOf(board: BoardDocument, draftId: string, format: DetailFormat): DraftDetailModel | null {
  const { page } = board;
  const draft = page.facts.drafts.find((candidate) => candidate.id === draftId);
  if (draft === undefined) return null;
  return {
    form:      'draft',
    idText:    draft.id,
    title:     draft.title,
    stateWord: DraftWordsUtil.stateWordOf(draft.state),
    facts:     [
      ...DetailFactsModel.textFactsOf([['claimed by', draft.claimOwner ?? UNCLAIMED_TEXT]]),
      ...DetailFactsModel.stampFactsOf([['opened', draft.openedAt]], format),
      ...DetailFactsModel.textFactsOf([['waiting on you', draft.openQuestionCount === 0 ? undefined : DraftWordsUtil.openQuestionCountTextOf(draft.openQuestionCount)]]),
    ],
    request:   page.draftRequests.find((candidate) => candidate.id === draftId)?.request ?? '',
    questions: draft.questions.map(questionModelOf),
  };
}

export const DraftDetailModelUtil = Object.freeze({ draftDetailModelOf, answerTextOf });
