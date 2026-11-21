import type { HephaestusState } from './TrackerProgress.ts';

export interface Concurrency {
  limit:          number;
  /** The live build and review jobs; merge, merge-agent, refresh, session and pipeline agent jobs hold no slot, and a row with no job counts nothing. */
  agentsInFlight: number;
  /** Never negative: a limit lowered below the agents already in flight leaves no slot, and takes none of them back. */
  freeSlots:      number;
}

export interface DispatchCapacity extends Concurrency {
  readyTicketIds:  string[];
  hephaestusState: HephaestusState;
  heldTicketIds:   string[];
}
