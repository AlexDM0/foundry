/**
 * How a board view opens the detail panel in place: the tab it shows, the detail open over it, and the openers. Every opener keeps the
 * tab, so the panel slides over the view the viewer is on; a second click on what is open closes it. The shell provides the value from
 * the hash route; a spec provides its own.
 */
import { createContext, useContext } from 'react';

import { DetailRoute, type DetailItem, type DetailTab } from './DetailRoute.ts';
import { HashRouter, type BridgeRoute }                 from './HashRouter.ts';

export interface DetailRouting {
  readonly tab:          DetailTab;
  /** What the panel shows now, `null` while it is closed; a view marks that item `data-selected`. */
  readonly openItem:     DetailItem | null;
  /** The fragment an opener links to: it opens `item` over this tab, or closes the panel when `item` is already open. */
  readonly openerHrefOf: (item: DetailItem) => string;
  /** What a click, Enter or Space on an opener does: opens `item`, or closes the panel when it is already open. */
  readonly toggle:       (item: DetailItem) => void;
  readonly close:        () => void;
  readonly isOpen:       (item: DetailItem) => boolean;
}

export function detailRoutingOf(tab: DetailTab, openItem: DetailItem | null, navigate: (route: BridgeRoute) => void): DetailRouting {
  return {
    tab,
    openItem,
    openerHrefOf: (item) => HashRouter.fragmentOf(DetailRoute.openerRouteOf(tab, openItem, item)),
    toggle:       (item) => navigate(DetailRoute.openerRouteOf(tab, openItem, item)),
    close:        () => navigate({ tab, item: null }),
    isOpen:       (item) => DetailRoute.detailItemsAreEqual(openItem, item),
  };
}

export const DetailRoutingContext = createContext<DetailRouting>(detailRoutingOf('kanban', null, HashRouter.navigateTo));

export function useDetailRouting(): DetailRouting {
  return useContext(DetailRoutingContext);
}
