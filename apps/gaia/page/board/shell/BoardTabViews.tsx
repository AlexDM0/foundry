/** Every tab of Gaia's board, each with the view that draws it. */
import type { ReactNode } from 'react';

import type { BoardDocument }        from '../../@types/board/BoardDocument.ts';
import type { BoardServices }        from '../@types/BoardServices.ts';
import type { ConnectionState }      from '../api/BoardEventStreamClient.ts';
import type { PreferenceStore }      from '../preferences/PreferenceStore.ts';
import { AgentsView }                from '../views/agents/AgentsView.tsx';
import { AssistantView }             from '../views/assistant/AssistantView.tsx';
import { TicketDocumentsView }       from '../views/documents/TicketDocumentsView.tsx';
import { EpicsView }                 from '../views/epics/EpicsView.tsx';
import { IntakeView }                from '../views/intake/IntakeView.tsx';
import { KanbanTabView }             from '../views/kanban/KanbanTabView.tsx';
import { PipelineView }              from '../views/pipeline/PipelineView.tsx';
import { ProgressTabView }           from '../views/progress/ProgressTabView.tsx';
import { QuestionsTabView }          from '../views/questions/QuestionsView.tsx';
import { TicketsView }               from '../views/tickets/TicketsView.tsx';
import { WavesTabView }              from '../views/waves/WavesView.tsx';
import { useBoardClock }             from './BoardClock.ts';
import type { BoardRoute, BoardTab } from './BoardRouter.ts';
import { DetailRoute }               from './DetailRoute.ts';

export interface BoardTabViewProps {
  readonly board:      BoardDocument;
  /** The route shown: the tab this view draws, and the item it opens there. */
  readonly route:      BoardRoute;
  readonly connection: ConnectionState;
  readonly boardStore: PreferenceStore;
  readonly services:   BoardServices;
}

export type BoardTabView = (props: BoardTabViewProps) => ReactNode;

export type BoardTabViewTable = Readonly<Record<BoardTab, BoardTabView>>;

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
  kanban:    KanbanTabView,
  waves:     WavesTabView,
  progress:  ProgressTabView,
  epics:     ({ board, route, connection }) => <EpicsView board={board} pointedEpicKey={DetailRoute.pointedEpicKeyOf(route)} connection={connection} />,
  tickets:   ({ board, boardStore }) => <TicketsView board={board} boardStore={boardStore} />,
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
