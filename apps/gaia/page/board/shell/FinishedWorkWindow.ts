/**
 * The finished-work window the filter line sets, as every board tab reads it: the choice, the moment finished work must have closed at or
 * after to show, and the widening to all a tab offers under its finished work. The shell provides it from the stored choice and the board's
 * moment; comparing with it decides only what shows.
 */
import { createContext, useContext } from 'react';

import { DEFAULT_FINISHED_WORK_CHOICE, type FinishedWorkChoice } from '../utils/FinishedWorkUtil.ts';

export interface FinishedWorkWindow {
  readonly choice:                  FinishedWorkChoice;
  /** `-Infinity` for all; read with `FinishedWorkUtil.ticketFinishedEpochMillisecondsOf` and `shownEpicsOf`. */
  readonly cutoffEpochMilliseconds: number;
  /** The board's moment the cutoff was taken from, read once per board. */
  readonly nowEpochMilliseconds:    number;
  /** Chooses all, as the filter line's own choice does. */
  readonly showAll:                 () => void;
}

export const FinishedWorkWindowContext = createContext<FinishedWorkWindow>({
  choice:                  DEFAULT_FINISHED_WORK_CHOICE,
  cutoffEpochMilliseconds: Number.NEGATIVE_INFINITY,
  nowEpochMilliseconds:    0,
  showAll:                 () => undefined,
});

export function useFinishedWorkWindow(): FinishedWorkWindow {
  return useContext(FinishedWorkWindowContext);
}
