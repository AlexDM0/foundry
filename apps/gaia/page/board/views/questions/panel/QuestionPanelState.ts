/**
 * The question panel's open state, which the shell keeps: the decision User pointed it at, whether User opened it, and the decisions open
 * when User last folded it, kept per board in the `question-panel` preference so a reload keeps the fold. Fold to the tab and × both fold
 * it and forget the pointed decision, so a decision opened after the fold shows the panel again at that new decision.
 */
import {
  createContext,
  useCallback,
  useMemo,
  useState
} from 'react';

import type { PreferenceStore } from '../../../preferences/PreferenceStore.ts';
import type { OpenDecision }    from '../QuestionsModel.ts';
import { QuestionPanelModel }   from './QuestionPanelModel.ts';

/** The board's preference holding the decisions open when User last folded the panel. */
export const QUESTION_PANEL_CHOICE_NAME = 'question-panel';

export interface QuestionPanelState {
  /** What the panel shows; `null` while it is folded or nothing is open. */
  readonly shownDecision: OpenDecision | null;
  /** User opened the panel at a decision, rather than a decision opening it. */
  readonly openedByUser:  boolean;
  /** Shows the panel at the decision. */
  readonly open:          (decisionId: string) => void;
  readonly fold:          () => void;
  readonly close:         () => void;
  /** Points the panel at the decision after the shown one. */
  readonly showNext:      () => void;
}

interface UserChoice {
  readonly pointedDecisionId: string | null;
  readonly openedByUser:      boolean;
}

const NOTHING_CHOSEN: UserChoice = { pointedDecisionId: null, openedByUser: false };

/** The decision the question panel shows, which the shell provides to the Questions tab; `null` while it shows none. */
export const ShownQuestionContext = createContext<string | null>(null);

export function useQuestionPanelState(
  boardStore: PreferenceStore,
  queue: readonly OpenDecision[],
): QuestionPanelState {
  const [choice, setChoice] = useState<UserChoice>(NOTHING_CHOSEN);
  const [foldedNow, setFoldedNow] = useState<readonly string[] | null>(null);
  const foldedDecisionIds = useMemo(() => foldedNow ?? boardStore.readTextList(QUESTION_PANEL_CHOICE_NAME), [foldedNow, boardStore]);
  const isShown = QuestionPanelModel.panelIsShownOf(queue, foldedDecisionIds, choice.openedByUser);
  const shownDecision = isShown ? QuestionPanelModel.shownDecisionOf(queue, choice.pointedDecisionId, foldedDecisionIds) : null;
  const shownDecisionId = shownDecision?.decision.id ?? null;

  const foldOpenDecisions = useCallback(() => {
    const openDecisionIds = queue.map(({ decision }) => decision.id);
    boardStore.writeTextList(QUESTION_PANEL_CHOICE_NAME, openDecisionIds);
    setFoldedNow(openDecisionIds);
    setChoice(NOTHING_CHOSEN);
  }, [queue, boardStore]);

  return {
    shownDecision,
    openedByUser: choice.openedByUser,
    open:         useCallback((decisionId: string) => setChoice({ pointedDecisionId: decisionId, openedByUser: true }), []),
    fold:         foldOpenDecisions,
    close:        foldOpenDecisions,
    showNext:     useCallback(() => {
      if (shownDecisionId === null) return;
      setChoice((current) => ({ ...current, pointedDecisionId: QuestionPanelModel.nextDecisionIdOf(queue, shownDecisionId) }));
    }, [queue, shownDecisionId]),
  };
}
