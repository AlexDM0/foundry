/**
 * How a Flint slot tells the board's host of Flint that it shows, so the visit target prefers it (`page/board/flint/VisitTargetTracker.ts`).
 * With no host above, a slot tells no one.
 */
import { createContext } from 'react';

/** Says that the slot's element shows; returns the function that says it is gone. */
export type FlintSlotShowing = (slotElement: HTMLElement) => () => void;

const SHOWN_TO_NO_ONE: FlintSlotShowing = () => () => undefined;

export const FlintSlotShowingContext = createContext<FlintSlotShowing>(SHOWN_TO_NO_ONE);
