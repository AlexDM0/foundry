/**
 * The tabs Gaia's board draws itself, each with the view that draws it. A tab moves in here with its view; until then the forge view shows
 * the forge's own Bridge in a frame for it, under the board's header.
 */
import type { ReactNode } from 'react';

import type { BoardDocument }        from '../../@types/board/BoardDocument.ts';
import type { BoardServices }        from '../@types/BoardServices.ts';
import type { ConnectionState }      from '../api/BoardEventStreamClient.ts';
import type { PreferenceStore }      from '../preferences/PreferenceStore.ts';
import { AgentsView }                from '../views/agents/AgentsView.tsx';
import { AssistantView }             from '../views/assistant/AssistantView.tsx';
import { IntakeView }                from '../views/intake/IntakeView.tsx';
import { KanbanTabView }             from '../views/kanban/KanbanTabView.tsx';
import { ProgressTabView }           from '../views/progress/ProgressTabView.tsx';
import { QuestionsTabView }          from '../views/questions/QuestionsView.tsx';
import { TicketsView }               from '../views/tickets/TicketsView.tsx';
import type { BoardRoute, BoardTab } from './BoardRouter.ts';

export interface BoardTabViewProps {
  readonly board:      BoardDocument;
  /** The route shown: the tab this view draws, and the item it opens there. */
  readonly route:      BoardRoute;
  readonly connection: ConnectionState;
  readonly boardStore: PreferenceStore;
  readonly services:   BoardServices;
}

export type BoardTabView = (props: BoardTabViewProps) => ReactNode;

export type BoardTabViewTable = Readonly<Partial<Record<BoardTab, BoardTabView>>>;

function IntakeTabView({ board, route, services }: BoardTabViewProps) {
  return <IntakeView board={board} followTranscript={services.followTranscript} selectedItem={route.item} />;
}

export const BOARD_TAB_VIEWS: BoardTabViewTable = {
  kanban:    KanbanTabView,
  progress:  ProgressTabView,
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
};
