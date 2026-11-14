/**
 * What the page reads off a fleet document the same way in every view: a forge by its tracker id, and what of a forge waits on User at
 * the fidelity it was read at.
 */
import type { FleetDocument, FleetDocumentForge } from '../../@types/FleetDocument.ts';

function forgeOf(fleetDocument: FleetDocument, trackerId: string): FleetDocumentForge | null {
  return fleetDocument.forges.find((forge) => forge.trackerId === trackerId) ?? null;
}

/** What waits on User from the forge as the forge counts it; a forge read through its summary may report no count, which is `null`, not zero. */
function waitingCountOf(forge: FleetDocumentForge): number | null {
  return forge.fidelity === 'counts-only' ? forge.attentionCount : forge.attention.length;
}

export const FleetDocumentUtil = {
  forgeOf,
  waitingCountOf,
} as const;
