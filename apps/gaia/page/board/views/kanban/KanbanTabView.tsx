/**
 * The Kanban tab as the board shell draws it: the Kanban, with how many drafts wait on User in Tickets, or at its item `merge-queue` the
 * Merge queue lane's own detail, both from the forge's served facts.
 */
import { useBoardHrefOf }           from '../../shell/BoardRouteLinks.ts';
import type { BoardTabViewProps }   from '../../shell/BoardTabViews.tsx';
import { WaitingOnUserModel }       from '../../shell/WaitingOnUserModel.ts';
import { MergeQueueModel }          from '../merge-queue/MergeQueueModel.ts';
import { MergeQueueView }           from '../merge-queue/MergeQueueView.tsx';
import { useKanbanTabSurroundings } from './KanbanTabSurroundings.ts';
import { KanbanView }               from './KanbanView.tsx';

/** The Kanban's Merge queue lane opens its detail at `progress/kanban/merge-queue`. */
export const MERGE_QUEUE_ITEM = 'merge-queue';

export function KanbanTabView({
  board, route, connection, boardStore
}: BoardTabViewProps) {
  const surroundings = useKanbanTabSurroundings();
  const hrefOf = useBoardHrefOf();
  if (route.item === MERGE_QUEUE_ITEM) {
    return (
      <MergeQueueView
        targets={MergeQueueModel.mergeQueueModelOf(board.mergeQueue, board.notices)}
        orderText={MergeQueueModel.orderTextOf(board.pipeline.applied, board.limits)}
      />
    );
  }
  return (
    <KanbanView
      board={board}
      filters={surroundings.filters}
      boardStore={boardStore}
      streamIsLive={connection === 'live'}
      mergeQueueHref={hrefOf({ tab: 'kanban', item: MERGE_QUEUE_ITEM })}
      draftsWaitingCount={WaitingOnUserModel.draftsWaitingCountOf(WaitingOnUserModel.waitingOnUserOf(board))}
      ticketsHref={hrefOf({ tab: 'tickets', item: null })}
      onShowAllFinished={surroundings.showAllFinished}
      laneHighlight={surroundings.laneHighlight}
      onLaneHighlightTaken={surroundings.takeLaneHighlight}
      onChooseEntity={surroundings.chooseEntity}
    />
  );
}
