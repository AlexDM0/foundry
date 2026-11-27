/**
 * Which right-edge panel covers the end of a board view now, so the view makes room as wide as it: the detail panel while an item is routed,
 * else the question panel while it shows. Either panel holds the page's one Flint slot, so a view it covers shows none.
 */
import { createContext, useContext } from 'react';

import { useDetailRouting } from './routing/DetailRouting.ts';

/** The `tokens.css` width of the panel that covers the view. */
export type CoveringPanelWidthProperty = '--side-panel-width' | '--side-panel-wide-width';

export const QuestionPanelShownContext = createContext(false);

/** `null` while no panel covers the view. */
export function useCoveringPanelWidthProperty(): CoveringPanelWidthProperty | null {
  const routing = useDetailRouting();
  const questionPanelIsShown = useContext(QuestionPanelShownContext);
  if (routing.openItem !== null) return '--side-panel-width';
  return questionPanelIsShown ? '--side-panel-wide-width' : null;
}

/** A side panel holding its own Flint slot covers the view, so the view shows none: a page has one slot. */
export function useCoveringPanelHoldsTheFlintSlot(): boolean {
  const routing = useDetailRouting();
  const questionPanelIsShown = useContext(QuestionPanelShownContext);
  return routing.openItem !== null || questionPanelIsShown;
}

/**
 * The question panel shows while the detail panel still slides out after its item closed, so the detail's state card shows no Flint slot:
 * a page has one slot. While an item is routed, the question panel hides behind the detail, and the detail holds the slot.
 */
export function useQuestionPanelHoldsTheFlintSlot(): boolean {
  const routing = useDetailRouting();
  const questionPanelIsShown = useContext(QuestionPanelShownContext);
  return routing.openItem === null && questionPanelIsShown;
}
