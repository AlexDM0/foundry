/**
 * A board view under the fixture's tracker, as a mounted board provides it, with every route it follows recorded instead of moving the
 * address bar, so a DOM spec reads the links a view draws and the routes it goes to. Test-only.
 */
import type { ReactElement, ReactNode } from 'react';

import { BoardGoToContext, BoardTrackerContext } from '../shared/routing/BoardRouteLinks.ts';
import { FIXTURE_TRACKER_ID }                    from './BoardStateFixture.ts';

export interface BoardRouteSurroundings {
  /** Every fragment the view went to, in order. */
  readonly followed: string[];
  readonly wrap:     (view: ReactNode) => ReactElement;
}

export function boardRouteSurroundings(): BoardRouteSurroundings {
  const followed: string[] = [];
  const goTo = (fragment: string): void => {
    followed.push(fragment);
  };
  return {
    followed,
    wrap: (view) => (
      <BoardTrackerContext.Provider value={FIXTURE_TRACKER_ID}>
        <BoardGoToContext.Provider value={goTo}>{view}</BoardGoToContext.Provider>
      </BoardTrackerContext.Provider>
    ),
  };
}

/** The address a board link under the fixture's tracker points at, `#forge/example-tracker/<path>`. */
export function boardHrefOf(boardPath: string): string {
  return `#forge/${FIXTURE_TRACKER_ID}/${boardPath}`;
}
