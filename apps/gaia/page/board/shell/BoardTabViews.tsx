/**
 * The tabs Gaia's board draws itself, each with the view that draws it. A tab moves in here with its view; until then the forge view shows
 * the forge's own Bridge in a frame for it, under the board's header.
 */
import type { ReactNode } from 'react';

import type { BoardDocument }        from '../../@types/board/BoardDocument.ts';
import type { BoardServices }        from '../@types/BoardServices.ts';
import type { ConnectionState }      from '../api/BoardEventStreamClient.ts';
import type { PreferenceStore }      from '../preferences/PreferenceStore.ts';
import { QuestionsTabView }          from '../views/questions/QuestionsView.tsx';
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

export const BOARD_TAB_VIEWS: BoardTabViewTable = { questions: QuestionsTabView, };
