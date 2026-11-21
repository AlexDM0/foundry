/**
 * The address a link of the board points at: a board route under the tracker the board is mounted for. Whoever mounts the board provides
 * `BoardServices.trackerId` here, so a link inside a card names its forge without every part being handed its tracker id.
 */
import { createContext, useContext } from 'react';

import { BoardRouter, type BoardRoute } from './BoardRouter.ts';

export const BoardTrackerContext = createContext<string | null>(null);

export function useBoardHrefOf(): (route: BoardRoute) => string {
  const trackerId = useContext(BoardTrackerContext);
  if (trackerId === null) throw new Error('A board link was drawn outside a mounted board: no BoardTrackerContext names its tracker.');
  return (route) => BoardRouter.fragmentOf(trackerId, route);
}

/** Moves Gaia's address to a fragment, as `BoardServices.goTo` does; whoever mounts the board provides it beside the tracker id. */
export const BoardGoToContext = createContext<((fragment: string) => void) | null>(null);

/** Goes to a board route of the mounted board, as following its link would; a route followed outside a mounted board throws when followed. */
export function useBoardNavigation(): (route: BoardRoute) => void {
  const trackerId = useContext(BoardTrackerContext);
  const goTo = useContext(BoardGoToContext);
  return (route) => {
    if (trackerId === null || goTo === null) throw new Error('A board route was followed outside a mounted board: no BoardTrackerContext or BoardGoToContext.');
    goTo(BoardRouter.fragmentOf(trackerId, route));
  };
}
