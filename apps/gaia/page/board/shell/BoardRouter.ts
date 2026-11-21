/**
 * The board's routes: its tabs in their order, and a route as the tab and the item it opens. A route is written into Gaia's address as
 * `#forge/<trackerId>/<tab>[/<item segments>]`, each segment encoded, so a link survives a reload and needs no server route.
 */

/** The board tabs in their order, then the others, Pipeline last. */
export const BOARD_TABS = ['kanban', 'waves', 'progress', 'epics', 'tickets', 'agents', 'questions', 'assistant', 'intake', 'pipeline'] as const;

export type BoardTab = typeof BOARD_TABS[number];

export interface BoardRoute {
  readonly tab:  BoardTab;
  /** The item the route opens in its tab, `null` for the tab alone. */
  readonly item: string | null;
}

const ITEM_SEGMENT_SEPARATOR = '/';

function fragmentOf(trackerId: string, route: BoardRoute): string {
  const trackerPath = `#forge/${encodeURIComponent(trackerId)}/${route.tab}`;
  if (route.item === null) return trackerPath;
  return `${trackerPath}/${route.item.split(ITEM_SEGMENT_SEPARATOR).map(encodeURIComponent).join(ITEM_SEGMENT_SEPARATOR)}`;
}

export const BoardRouter = Object.freeze({ fragmentOf });
