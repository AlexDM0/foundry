/** Every tab of Gaia's board, each with the view that draws it. */
import type { BoardTabViewProps, BoardTabViewTable } from '../@types/BoardTabViewProps.ts';
import { useBoardClock }                             from '../shared/BoardClock.ts';
import { DetailRoute }                               from '../shared/routing/DetailRoute.ts';
import { AgentsView }                                from '../views/agents/AgentsView.tsx';
import { AssistantView }                             from '../views/assistant/AssistantView.tsx';
import { TicketDocumentsView }                       from '../views/documents/TicketDocumentsView.tsx';
import { EpicsView }                                 from '../views/epics/EpicsView.tsx';
import { IntakeView }                                from '../views/intake/IntakeView.tsx';
import { KanbanTabView }                             from '../views/kanban/KanbanTabView.tsx';
import { PipelineView }                              from '../views/pipeline/PipelineView.tsx';
import { ProgressTabView }                           from '../views/progress/ProgressTabView.tsx';
import { QuestionsTabView }                          from '../views/questions/QuestionsView.tsx';
import { TicketsView }                               from '../views/tickets/TicketsView.tsx';
import { WavesTabView }                              from '../views/waves/WavesView.tsx';

function IntakeTabView({ board, route, services }: BoardTabViewProps) {
  return <IntakeView board={board} followTranscript={services.followTranscript} selectedItem={route.item} />;
}

function PipelineTabView({ board, route, services }: BoardTabViewProps) {
  const clock = useBoardClock();
  return (
    <PipelineView facts={board} route={route} followTranscript={services.followTranscript} followProfileLog={services.followProfileLog} clock={clock} />
  );
}

export const BOARD_TAB_VIEWS: BoardTabViewTable = {
  tickets:   ({ board, route, boardStore }) => <TicketsView board={board} boardStore={boardStore} routeItem={route.item} />,
  kanban:    KanbanTabView,
  waves:     WavesTabView,
  gantt:     ProgressTabView,
  epics:     ({ board, route, connection }) => <EpicsView board={board} pointedEpicKey={DetailRoute.pointedEpicKeyOf(route)} connection={connection} />,
  questions: QuestionsTabView,
  agents:    ({ board, route, services }) => (
    <AgentsView
      board={board}
      selectedJobId={route.item}
      followTranscript={services.followTranscript}
    />
  ),
  assistant: ({ board, services }) => <AssistantView board={board} followTranscript={services.followTranscript} />,
  intake:    IntakeTabView,
  pipeline:  PipelineTabView,
  documents: TicketDocumentsView,
};
