/**
 * The Bridge's routes are hash fragments, `#<tab>` or `#<tab>/<item>` (`#agents/J12`, `#tickets/ticket-row/042`), so a link survives an
 * Overseer restart and needs no server route. A fragment naming no tab falls back to the stored tab, then the first; a tab the board does
 * not show (Waves without a dependency, Epics without an epic) falls back to the first.
 */
import { useEffect, useState } from 'react';

/** The static page's tabs in its order, then the Bridge's own. */
export const BRIDGE_TABS = ['kanban', 'waves', 'progress', 'epics', 'tickets', 'agents', 'questions', 'assistant', 'intake'] as const;

export type BridgeTab = typeof BRIDGE_TABS[number];

export interface BridgeRoute {
  readonly tab:  BridgeTab;
  /** The item the fragment opens in its tab, `null` for the tab alone. */
  readonly item: string | null;
}

export const TAB_CHOICE_NAME = 'tab';
export const [DEFAULT_TAB] = BRIDGE_TABS;

function isBridgeTab(name: string | null): name is BridgeTab {
  return (BRIDGE_TABS as readonly (string | null)[]).includes(name);
}

function routeOf(fragment: string, storedTab: string | null): BridgeRoute {
  const [tabName = '', ...itemParts] = fragment.replace(/^#/, '').split('/');
  const item = itemParts.map(decodeURIComponent).join('/');
  if (isBridgeTab(tabName)) return { tab: tabName, item: item === '' ? null : item };
  return { tab: isBridgeTab(storedTab) ? storedTab : DEFAULT_TAB, item: null };
}

/** Each segment of the item is encoded on its own, so an item's own `/` reads as a separator in the address bar. */
function fragmentOf(route: BridgeRoute): string {
  return route.item === null ? `#${route.tab}` : `#${route.tab}/${route.item.split('/').map(encodeURIComponent).join('/')}`;
}

/** The route itself while its tab is shown, else the first tab alone. */
function shownRouteOf(route: BridgeRoute, shownTabs: readonly BridgeTab[]): BridgeRoute {
  return shownTabs.includes(route.tab) ? route : { tab: DEFAULT_TAB, item: null };
}

/** Every tab but Waves on a board where no ticket depends on another, and Epics on one without epics; unknown before the first board. */
function shownTabsOf(boardHasWaves: boolean | null, boardHasEpics: boolean | null): BridgeTab[] {
  return BRIDGE_TABS.filter((tab) => !(tab === 'waves' && boardHasWaves === false) && !(tab === 'epics' && boardHasEpics === false));
}

/** The route the address bar names, followed through every `hashchange`. */
function useHashRoute(storedTab: () => string | null): BridgeRoute {
  const [route, setRoute] = useState(() => routeOf(window.location.hash, storedTab()));
  useEffect(() => {
    const follow = (): void => setRoute(routeOf(window.location.hash, storedTab()));
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [storedTab]);
  return route;
}

/** Moves the address bar to a route, as a link to its fragment would. */
function navigateTo(route: BridgeRoute): void {
  window.location.hash = fragmentOf(route);
}

export const HashRouter = Object.freeze({
  routeOf, fragmentOf, shownTabsOf, shownRouteOf, useHashRoute, navigateTo,
});
