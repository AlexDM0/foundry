/**
 * Test-only: a table with a view for every board tab, the views a spec names and, for every other tab, a stub that says which tab it draws
 * and at which item, so a spec of the shell reads which view the main area holds without drawing the real ones.
 */
import { BOARD_TABS, type BoardTab }            from '../shell/BoardRouter.ts';
import type { BoardTabView, BoardTabViewTable } from '../shell/BoardTabViews.tsx';

export const STUB_TAB_VIEW_TEXT = 'The stub view';

function stubTabView({ route }: Parameters<BoardTabView>[0]) {
  return <p>{`${STUB_TAB_VIEW_TEXT} of ${route.tab} at ${route.item ?? 'no item'}`}</p>;
}

export function stubTabViewsWith(namedViews: Readonly<Partial<Record<BoardTab, BoardTabView>>> = {}): BoardTabViewTable {
  const viewOfEveryTab = BOARD_TABS.map((tab): [BoardTab, BoardTabView] => [tab, namedViews[tab] ?? stubTabView]);
  return Object.fromEntries(viewOfEveryTab) as Record<BoardTab, BoardTabView>;
}
