/**
 * How a board view opens the detail panel in place: the tab it shows, the detail open over it, and the openers. Every opener keeps the
 * tab, so the panel slides over the view the viewer is on; a second click on what is open closes it. The shell provides the value from
 * the board's route; without one a view reads the Kanban with nothing open, its links under the mounted board.
 */
import { createContext, useContext } from 'react';

import { BoardTrackerContext, useBoardNavigation }      from './BoardRouteLinks.ts';
import { BoardRouter, type BoardRoute }                 from './BoardRouter.ts';
import { DetailRoute, type DetailItem, type DetailTab } from './DetailRoute.ts';

export interface DetailRouting {
  readonly tab:          DetailTab;
  /** What the panel shows now, `null` while it is closed; a view marks that item `data-selected`. */
  readonly openItem:     DetailItem | null;
  /** The link an opener points at: it opens `item` over this tab, or closes the panel when `item` is already open. */
  readonly openerHrefOf: (item: DetailItem) => string;
  /** What a click, Enter or Space on an opener does: opens `item`, or closes the panel when it is already open. */
  readonly toggle:       (item: DetailItem) => void;
  readonly close:        () => void;
  readonly isOpen:       (item: DetailItem) => boolean;
}

export function detailRoutingOf(
  tab: DetailTab,
  openItem: DetailItem | null,
  navigate: (route: BoardRoute) => void,
  hrefOf: (route: BoardRoute) => string,
): DetailRouting {
  return {
    tab,
    openItem,
    openerHrefOf: (item) => hrefOf(DetailRoute.openerRouteOf(tab, openItem, item)),
    toggle:       (item) => navigate(DetailRoute.openerRouteOf(tab, openItem, item)),
    close:        () => navigate({ tab, item: null }),
    isOpen:       (item) => DetailRoute.detailItemsAreEqual(openItem, item),
  };
}

export const DetailRoutingContext = createContext<DetailRouting | null>(null);

const DEFAULT_DETAIL_TAB: DetailTab = 'kanban';

/** The shell's routing, else the Kanban with nothing open under the mounted board, whose links name no tracker outside one and throw. */
export function useDetailRouting(): DetailRouting {
  const provided = useContext(DetailRoutingContext);
  const trackerId = useContext(BoardTrackerContext);
  const navigate = useBoardNavigation();
  if (provided !== null) return provided;
  if (trackerId === null) throw new Error('A detail opener was drawn outside a mounted board: no DetailRoutingContext or BoardTrackerContext.');
  return detailRoutingOf(DEFAULT_DETAIL_TAB, null, navigate, (route) => BoardRouter.fragmentOf(trackerId, route));
}
