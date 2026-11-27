/**
 * What the page's own head over a board, which the board draws at its top, is told while the board has no readable pipeline: the setup's
 * step bar, `null` before a setup record opens, and where the setup stands. Out of setup, before the first board and outside a board it is
 * `null`, and the head is the page's whole bar.
 */
import { createContext, type ReactNode, useContext } from 'react';

import type { SetupProgress } from '../../shared/@types/SetupProgress.ts';

export interface BoardSetupHead {
  readonly stepBar:  ReactNode;
  readonly progress: SetupProgress;
}

export const BoardSetupHeadContext = createContext<BoardSetupHead | null>(null);

export function useBoardSetupHead(): BoardSetupHead | null {
  return useContext(BoardSetupHeadContext);
}
