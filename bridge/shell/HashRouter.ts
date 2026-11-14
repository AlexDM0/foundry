/**
 * The Bridge's routes are hash fragments, `#<tab>` or `#<tab>/<item>` (`#agents/J12`, `#tickets/ticket-row/042`), so a link survives an
 * Overseer restart and needs no server route. A fragment naming no tab falls back to the stored tab, then the first; a tab the board does
 * not show (Waves without a dependency, Epics without an epic, every tab but Pipeline on a board with no readable pipeline) falls back to
 * the first tab it shows.
 */
import { useEffect, useMemo, useState } from 'react';

import { BridgeFragmentUtil } from '../../src/shared/monitor/utils/BridgeFragmentUtil.ts';

/** The board tabs in their order, then the others, Pipeline last. */
export const BRIDGE_TABS = ['kanban', 'waves', 'progress', 'epics', 'tickets', 'agents', 'questions', 'assistant', 'intake', 'pipeline'] as const;

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

function fragmentOf(route: BridgeRoute): string {
  return BridgeFragmentUtil.fragmentOf(route.tab, route.item);
}

/** The route itself while its tab is shown, else the first shown tab alone. */
function shownRouteOf(route: BridgeRoute, shownTabs: readonly BridgeTab[]): BridgeRoute {
  const [firstShownTab = DEFAULT_TAB] = shownTabs;
  return shownTabs.includes(route.tab) ? route : { tab: firstShownTab, item: null };
}

/**
 * Every tab but Waves on a board where no ticket depends on another, and Epics on one without epics; `null` is unknown, before the first
 * board. A board with no readable pipeline shows only Pipeline, and Pipeline shows only once the board says it has a readable one: an
 * Overseer that serves no pipeline facts leaves `boardHasPipeline` unknown.
 */
function shownTabsOf(boardHasWaves: boolean | null, boardHasEpics: boolean | null, boardHasPipeline: boolean | null): BridgeTab[] {
  if (boardHasPipeline === false) return ['pipeline'];
  return BRIDGE_TABS.filter((tab) => !(tab === 'waves' && boardHasWaves === false) && !(tab === 'epics' && boardHasEpics === false)
    && !(tab === 'pipeline' && boardHasPipeline === null));
}

/** The route the address bar names, followed through every `hashchange`, and read again once the stored tab can be read. */
function useHashRoute(storedTab: () => string | null): BridgeRoute {
  const [fragment, setFragment] = useState(() => window.location.hash);
  useEffect(() => {
    const follow = (): void => setFragment(window.location.hash);
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  return useMemo(() => routeOf(fragment, storedTab()), [fragment, storedTab]);
}

/** Moves the address bar to a route, as a link to its fragment would. */
function navigateTo(route: BridgeRoute): void {
  window.location.hash = fragmentOf(route);
}

export const HashRouter = Object.freeze({
  routeOf, fragmentOf, shownTabsOf, shownRouteOf, useHashRoute, navigateTo,
});
