/**
 * How a view opens the question panel at a decision without importing it, such as the Kanban's asks pill or a Questions card's "Open beside
 * the board". The shell provides the opener; outside the shell a press leads to the Questions tab.
 */
import { createContext, useContext } from 'react';

import { useBoardNavigation } from './BoardRouteLinks.ts';

export type QuestionPanelOpener = (decisionId: string) => void;

export const QuestionPanelOpenerContext = createContext<QuestionPanelOpener | null>(null);

export function useQuestionPanelOpener(): QuestionPanelOpener {
  const provided = useContext(QuestionPanelOpenerContext);
  const navigate = useBoardNavigation();
  return provided ?? (() => navigate({ tab: 'questions', item: null }));
}
