/**
 * The Bridge's routes are hash fragments, `#<tab>` or `#<tab>/<item>` (`#agents/J12`, `#tickets/42`), so a link survives an Overseer restart
 * and needs no server route. A fragment naming no tab falls back to the stored tab, then the first.
 */
import { useEffect, useMemo, useState } from 'react';

export const BRIDGE_TABS = ['kanban', 'progress', 'tickets', 'agents', 'questions', 'assistant', 'intake'] as const;

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
  const item = itemParts.join('/');
  if (isBridgeTab(tabName)) return { tab: tabName, item: item === '' ? null : decodeURIComponent(item) };
  return { tab: isBridgeTab(storedTab) ? storedTab : DEFAULT_TAB, item: null };
}

function fragmentOf(route: BridgeRoute): string {
  return route.item === null ? `#${route.tab}` : `#${route.tab}/${encodeURIComponent(route.item)}`;
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

export const HashRouter = Object.freeze({ routeOf, fragmentOf, useHashRoute });
