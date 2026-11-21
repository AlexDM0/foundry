/**
 * Which habitat Flint lives in, as its handle tells it: a view starts a behaviour that takes one of its elements (`chase-bug`,
 * `lay-bar-along`) only while Flint lives in that view's habitat, since the behaviour runs on the floor of the habitat Flint lives in. With
 * no Flint made, Flint lives nowhere.
 */
import type { FlintHandle } from 'flint';
import { createContext }    from 'react';


export interface FlintDwelling {
  readonly livesIn: (habitatKind: string) => boolean;
}

export const NOWHERE_DWELLING: FlintDwelling = Object.freeze({ livesIn: () => false });

export const FlintDwellingContext = createContext<FlintDwelling>(NOWHERE_DWELLING);

/** Asks the handle on each question, so the answer is where Flint lives at that moment. */
export function dwellingOf(handle: Pick<FlintHandle, 'livesIn'> | null): FlintDwelling {
  if (handle === null) return NOWHERE_DWELLING;
  return Object.freeze({ livesIn: (habitatKind: string) => handle.livesIn() === habitatKind });
}
