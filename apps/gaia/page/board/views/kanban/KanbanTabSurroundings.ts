/**
 * What the Kanban tab reads from the shell around it: the filter menu's Kanban sections read against the board and the entity rail's
 * choice, which the header's filter shares, the lane a header figure asked for, and the widening of the finished-work window to all.
 */
import { createContext, useContext } from 'react';

import type { KanbanFilterModel }          from './KanbanModel.ts';
import type { KanbanLaneHighlightRequest } from './KanbanView.tsx';

export interface KanbanTabSurroundings {
  readonly filters:           KanbanFilterModel;
  /** `null` shows every entity. */
  readonly chooseEntity:      (entityKey: string | null) => void;
  readonly laneHighlight:     KanbanLaneHighlightRequest | null;
  readonly takeLaneHighlight: () => void;
  readonly showAllFinished:   () => void;
}

export const KanbanTabSurroundingsContext = createContext<KanbanTabSurroundings | null>(null);

/** The shell provides it wherever the Kanban tab draws; a Kanban drawn without it is a wiring fault, never a state to show. */
export function useKanbanTabSurroundings(): KanbanTabSurroundings {
  const surroundings = useContext(KanbanTabSurroundingsContext);
  if (surroundings === null) throw new Error('the Kanban tab is drawn outside the board shell that provides its surroundings');
  return surroundings;
}
