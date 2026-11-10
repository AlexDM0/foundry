/**
 * Which right-edge panel covers the end of a board view now, so the view makes room as wide as it: the detail panel while an item is
 * routed, else the question panel while it shows. One panel shows at a time, the detail panel over the question panel. The shell says
 * whether the question panel shows; a spec provides its own.
 */
import { createContext, useContext } from 'react';

import { useDetailRouting } from './DetailRouting.ts';

/** The `tokens.css` width of the panel that covers the view. */
export type CoveringPanelWidthProperty = '--detail-w' | '--question-panel-w';

export const QuestionPanelShownContext = createContext(false);

/** `null` while no panel covers the view. */
export function useCoveringPanelWidthProperty(): CoveringPanelWidthProperty | null {
  const routing = useDetailRouting();
  const questionPanelIsShown = useContext(QuestionPanelShownContext);
  if (routing.openItem !== null) return '--detail-w';
  return questionPanelIsShown ? '--question-panel-w' : null;
}
