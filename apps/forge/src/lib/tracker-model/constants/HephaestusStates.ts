import type { HephaestusState } from '../@types/TrackerProgress.ts';

export const HEPHAESTUS_STATES = ['running', 'paused'] as const satisfies readonly HephaestusState[];

/** What a tracker that never set a Hephaestus state reads: the first start waits for the user's go, as a pause by the user does. */
export const DEFAULT_HEPHAESTUS_STATE: HephaestusState = 'paused';
