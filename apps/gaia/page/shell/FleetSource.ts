/**
 * The newest fleet document the page holds, and who listens for the next one. The shell reads it through React's external-store hook, so
 * every published document re-renders the shell in place: a forge that joins or leaves the registry joins or leaves the rail, no reload.
 */
import type { FleetDocument } from '../@types/FleetDocument.ts';

export interface FleetSource {
  /** `null` until the first document arrives. */
  readonly current:   () => FleetDocument | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly publish:   (fleetDocument: FleetDocument) => void;
}

export function createFleetSource(): FleetSource {
  let newestDocument: FleetDocument | null = null;
  const listeners = new Set<() => void>();
  return {
    current:   () => newestDocument,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (fleetDocument) => {
      newestDocument = fleetDocument;
      [...listeners].forEach((listener) => listener());
    },
  };
}
