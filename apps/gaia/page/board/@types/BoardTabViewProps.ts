import type { ReactNode } from 'react';

import type { BoardDocument }        from '../../@types/board/BoardDocument.ts';
import type { BoardRoute, BoardTab } from '../../shared/BoardRouter.ts';
import type { ConnectionState }      from '../api/BoardEventStreamClient.ts';
import type { PreferenceStore }      from '../preferences/PreferenceStore.ts';
import type { BoardServices }        from './BoardServices.ts';

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
