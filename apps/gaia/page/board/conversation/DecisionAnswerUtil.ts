import type { BoardDecisionDocument } from '../../@types/board/BoardDecisionDocuments.ts';

export type QuestionSelections = readonly (readonly number[])[];

/** What `decide` takes: one choice of option letters per question, or one free text for a decision of one question. */
export type DecisionAnswerDocument =
  | { readonly form: 'letters'; readonly choices: readonly string[] }
  | { readonly form: 'text'; readonly text: string };

const FIRST_OPTION_LETTER_CODE = 'a'.codePointAt(0) ?? 0;

function optionLetterOf(optionIndex: number): string {
  return String.fromCodePoint(FIRST_OPTION_LETTER_CODE + optionIndex);
}

/**
 * The answer a form holds, or `null` while it cannot be sent: free text answers a decision of one question; otherwise every question needs
 * a choice, a single-select question exactly one.
 */
function answerOf(decision: BoardDecisionDocument, selections: QuestionSelections, freeText: string): DecisionAnswerDocument | null {
  if (freeText.trim() !== '') return decision.questions.length === 1 ? { form: 'text', text: freeText.trim() } : null;
  if (decision.questions.length === 0) return null;
  const choices = decision.questions.map((question, questionIndex) => {
    const chosen = [...(selections[questionIndex] ?? [])].sort((a, b) => a - b);
    const fitting = question.multiSelect ? chosen.length > 0 : chosen.length === 1;
    return fitting ? chosen.map(optionLetterOf).join('') : null;
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

export const DecisionAnswerUtil = Object.freeze({ optionLetterOf, answerOf, selectionsAfter });
