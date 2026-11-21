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
