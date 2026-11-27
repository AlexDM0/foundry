/**
 * The answer state every decision card keeps: nothing starts chosen; the free text of a decision of one question is an option of its own,
 * chosen by clicking or typing into it and left again by choosing another option, which keeps its words for a later return.
 */
import { useState } from 'react';

import {
  DecisionAnswerUtil,
  type DecisionAnswerDocument,
  type DecisionQuestionView,
  type QuestionSelections
} from './DecisionAnswerUtil.ts';

export interface DecisionAnswerState {
  readonly selections:       QuestionSelections;
  readonly freeText:         string;
  readonly freeTextIsChosen: boolean;
  /** `null` while the form holds no answer it could send. */
  readonly answer:           DecisionAnswerDocument | null;
  readonly chooseOption:     (questionIndex: number, optionIndex: number) => void;
  readonly toggleFreeText:   () => void;
  readonly changeFreeText:   (text: string) => void;
}

const NOTHING_CHOSEN: QuestionSelections = [];

export function useDecisionAnswer(questions: readonly DecisionQuestionView[]): DecisionAnswerState {
  const [selections, setSelections] = useState<QuestionSelections>(NOTHING_CHOSEN);
  const [freeText, setFreeText] = useState('');
  const [freeTextIsChosen, setFreeTextIsChosen] = useState(false);
  return {
    selections,
    freeText,
    freeTextIsChosen,
    answer:       DecisionAnswerUtil.answerOf(questions, selections, freeTextIsChosen ? freeText : null),
    chooseOption: (questionIndex, optionIndex) => {
      const multiSelect = questions[questionIndex]?.multiSelect ?? false;
      setSelections(DecisionAnswerUtil.selectionsAfter(freeTextIsChosen ? NOTHING_CHOSEN : selections, questionIndex, optionIndex, multiSelect));
      setFreeTextIsChosen(false);
    },
    toggleFreeText: () => {
      setSelections(NOTHING_CHOSEN);
      setFreeTextIsChosen(!freeTextIsChosen);
    },
    changeFreeText: setFreeText,
  };
}
