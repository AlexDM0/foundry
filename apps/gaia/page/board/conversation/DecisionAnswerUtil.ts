import { PAGE_CONTRACT_VERSIONS }                          from '../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }                       from '../../@types/board/BoardCommandDocument.ts';
import type { BoardDecisionDocument }                      from '../../@types/board/BoardDecisionDocuments.ts';
import { OptionConsequencesUtil, type OptionConsequences } from './OptionConsequencesUtil.ts';

export type QuestionSelections = readonly (readonly number[])[];

/** What `decide` takes: one choice of option letters per question, or one free text for a decision of one question. */
export type DecisionAnswerDocument =
  | { readonly form: 'letters'; readonly choices: readonly string[] }
  | { readonly form: 'text'; readonly text: string };

/** One option as every decision card draws it. */
export interface DecisionOptionView {
  /** The letter the forge takes the option by: `a`. */
  readonly letter:       string;
  readonly label:        string;
  /** `null` for an option asked with an empty description. */
  readonly description:  string | null;
  readonly recommended:  boolean;
  /** `null` when the agent noted no consequence for the option. */
  readonly consequences: OptionConsequences | null;
}

export interface DecisionQuestionView {
  readonly multiSelect: boolean;
  readonly options:     readonly DecisionOptionView[];
}

type DecisionQuestionDocument = BoardDecisionDocument['questions'][number];

const FIRST_OPTION_LETTER_CODE = 'a'.codePointAt(0) ?? 0;

function optionLetterOf(optionIndex: number): string {
  return String.fromCodePoint(FIRST_OPTION_LETTER_CODE + optionIndex);
}

/** The options as asked, each by the letter the forge gave it, or by its place where it gave none. */
function optionViewsOf(question: DecisionQuestionDocument): DecisionOptionView[] {
  return question.options.map((option, optionIndex) => ({
    letter:       option.letter === '' ? optionLetterOf(optionIndex) : option.letter,
    label:        option.label,
    description:  option.description === '' ? null : option.description,
    recommended:  option.recommended,
    consequences: OptionConsequencesUtil.consequencesOf(option),
  }));
}

function questionViewsOf(decision: BoardDecisionDocument): DecisionQuestionView[] {
  return decision.questions.map((question) => ({ multiSelect: question.multiSelect, options: optionViewsOf(question) }));
}

/**
 * The answer a form holds, or `null` while it cannot be sent: the chosen free text answers a decision of one question; otherwise every
 * question needs a choice, a single-select question exactly one.
 */
function answerOf(questions: readonly DecisionQuestionView[], selections: QuestionSelections, chosenFreeText: string | null): DecisionAnswerDocument | null {
  if (chosenFreeText !== null) {
    const text = chosenFreeText.trim();
    return questions.length === 1 && text !== '' ? { form: 'text', text } : null;
  }
  if (questions.length === 0) return null;
  const choices = questions.map((question, questionIndex) => {
    const chosen = [...(selections[questionIndex] ?? [])].sort((a, b) => a - b);
    const fitting = question.multiSelect ? chosen.length > 0 : chosen.length === 1;
    return fitting ? chosen.map((optionIndex) => question.options[optionIndex]?.letter ?? optionLetterOf(optionIndex)).join('') : null;
  });
  return choices.every((choice) => choice !== null) ? { form: 'letters', choices: choices as string[] } : null;
}

/** The choices after a click on an option: a single-select question takes it alone, a multi-select one toggles it. */
function selectionsAfter(selections: QuestionSelections, questionIndex: number, optionIndex: number, multiSelect: boolean): QuestionSelections {
  const current = selections[questionIndex] ?? [];
  const chosen = multiSelect
    ? (current.includes(optionIndex) ? current.filter((index) => index !== optionIndex) : [...current, optionIndex])
    : [optionIndex];
  return Array.from({ length: Math.max(selections.length, questionIndex + 1) }, (_unused, index) => (index === questionIndex ? chosen : selections[index] ?? []));
}

/** The `decision-answer` command for an answer, or `null` while there is none to send. */
function commandOf(decisionId: string, answer: DecisionAnswerDocument | null): BoardCommandDocument | null {
  return answer === null ? null : {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'decision-answer', decisionId, answer
  };
}

export const DecisionAnswerUtil = Object.freeze({
  optionLetterOf,
  optionViewsOf,
  questionViewsOf,
  answerOf,
  selectionsAfter,
  commandOf,
});
