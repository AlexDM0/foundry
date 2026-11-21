/**
 * The filters the shell keeps for the tabs it draws: the finished-work window every detail tab reads, the filter line at the tab bar's end
 * with the Kanban's sections in its menu on the Kanban, the Kanban's choices the menu and the entity rail share, and the lane a header
 * figure asked the Kanban to outline. A framed tab keeps the frame's own filter row, so the line shows only beside a tab drawn here.
 */
import {
  useCallback,
  useMemo,
  useState,
  type ReactNode
} from 'react';

import type { BoardDocument }                                                from '../../@types/board/BoardDocument.ts';
import type { PreferenceStore }                                              from '../preferences/PreferenceStore.ts';
import { FinishedWorkUtil }                                                  from '../utils/FinishedWorkUtil.ts';
import { useKanbanFilterChoices }                                            from '../views/kanban/KanbanFilterChoices.ts';
import { KanbanFilterSections }                                              from '../views/kanban/KanbanFilterSections.tsx';
import { KanbanModel }                                                       from '../views/kanban/KanbanModel.ts';
import type { KanbanTabSurroundings }                                        from '../views/kanban/KanbanTabSurroundings.ts';
import type { KanbanLaneHighlightRequest }                                   from '../views/kanban/KanbanView.tsx';
import type { BoardTab }                                                     from './BoardRouter.ts';
import { DetailRoute }                                                       from './DetailRoute.ts';
import { FinishedWorkFilter, useFinishedWorkChoice, type FinishedWorkCount } from './FinishedWorkFilter.tsx';
import type { FinishedWorkWindow }                                           from './FinishedWorkWindow.ts';
import type { HeaderFigureLane }                                             from './HeaderModel.ts';

export interface BoardTabFilters {
  /** What the tab bar holds at its right end; `null` off a detail tab drawn here, or before the first board. */
  readonly filterLine:         ReactNode;
  readonly finishedWorkWindow: FinishedWorkWindow;
  /** `null` before the first board. */
  readonly kanbanSurroundings: KanbanTabSurroundings | null;
  /** A header figure pointing at a Kanban lane was followed. */
  readonly showLane:           (lane: HeaderFigureLane) => void;
}

/** What the span buttons count on the shown tab: the finishing moment of each task on Progress, else of each ticket. */
function finishedWorkCountOf(board: BoardDocument, shownTab: BoardTab): FinishedWorkCount {
  const { tickets, progress } = board.page;
  if (shownTab !== 'progress') return { noun: 'ticket', finishedMoments: tickets.map(FinishedWorkUtil.ticketFinishedEpochMillisecondsOf) };
  const ticketMomentById = new Map(tickets.map((ticket) => [ticket.id, FinishedWorkUtil.ticketFinishedEpochMillisecondsOf(ticket)]));
  return {
    noun:            'task',
    finishedMoments: progress.tasks.map((task) => (
      FinishedWorkUtil.taskFinishedEpochMillisecondsOf(task, task.ticket === null ? null : ticketMomentById.get(task.ticket) ?? null)
    )),
  };
}

export function useBoardTabFilters(
  board: BoardDocument | null,
  shownTab: BoardTab,
  tabIsDrawnHere: boolean,
  boardStore: PreferenceStore,
  boardNowEpochMilliseconds: number,
): BoardTabFilters {
  const [finishedWorkChoice, chooseFinishedWork] = useFinishedWorkChoice(boardStore);
  const kanbanFilterChoices = useKanbanFilterChoices(boardStore);
  const [laneHighlight, setLaneHighlight] = useState<KanbanLaneHighlightRequest | null>(null);
  const takeLaneHighlight = useCallback(() => setLaneHighlight(null), []);
  const showLane = useCallback((laneKey: HeaderFigureLane) => setLaneHighlight((previous) => ({ laneKey, sequence: (previous?.sequence ?? 0) + 1 })), []);
  const {
    storedPressedChips, storedReadyOrder, storedEntity, storedSwimlanes, chooseEntity
  } = kanbanFilterChoices;
  const kanbanFilters = useMemo(
    () => (board === null ? null : KanbanModel.kanbanFilterModelOf(board, storedPressedChips, storedReadyOrder, storedEntity, storedSwimlanes)),
    [board, storedPressedChips, storedReadyOrder, storedEntity, storedSwimlanes],
  );
  const showAllFinished = useCallback(() => chooseFinishedWork('all'), [chooseFinishedWork]);
  const kanbanSurroundings = useMemo((): KanbanTabSurroundings | null => (kanbanFilters === null
    ? null
    : {
      filters: kanbanFilters, chooseEntity, laneHighlight, takeLaneHighlight, showAllFinished
    }), [kanbanFilters, chooseEntity, laneHighlight, takeLaneHighlight, showAllFinished]);
  const finishedWorkWindow = useMemo((): FinishedWorkWindow => ({
    choice:                  finishedWorkChoice,
    cutoffEpochMilliseconds: FinishedWorkUtil.cutoffEpochMillisecondsOf(finishedWorkChoice, boardNowEpochMilliseconds),
    nowEpochMilliseconds:    boardNowEpochMilliseconds,
  }), [finishedWorkChoice, boardNowEpochMilliseconds]);

  const onKanban = shownTab === 'kanban' && kanbanFilters !== null;
  const filterLine = board === null || !tabIsDrawnHere || !DetailRoute.isDetailTab(shownTab) ? null : (
    <FinishedWorkFilter
      choice={finishedWorkChoice}
      onChoice={chooseFinishedWork}
      tickets={board.page.tickets}
      epics={board.page.facts.epics}
      counted={finishedWorkCountOf(board, shownTab)}
      nowEpochMilliseconds={boardNowEpochMilliseconds}
      durationUnits={board.limits}
      tabSections={onKanban ? <KanbanFilterSections filters={kanbanFilters} choices={kanbanFilterChoices} epicRollups={board.page.facts.epics} /> : null}
      lineEpic={onKanban ? kanbanFilters.lineEpic : null}
      onResetTabFilters={kanbanFilterChoices.reset}
    />
  );
  return {
    filterLine, finishedWorkWindow, kanbanSurroundings, showLane
  };
}
