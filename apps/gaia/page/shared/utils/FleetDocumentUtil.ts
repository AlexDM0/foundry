/**
 * What the page reads off a fleet document the same way in every view: a forge by its tracker id, what of a forge waits on User at the
 * fidelity it was read at, and the forges whose agents no total counts.
 */
import type { FleetDocument, FleetDocumentForge } from '../../@types/FleetDocument.ts';

function forgeOf(fleetDocument: FleetDocument, trackerId: string): FleetDocumentForge | null {
  return fleetDocument.forges.find((forge) => forge.trackerId === trackerId) ?? null;
}

/** What waits on User from the forge as the forge counts it; a forge read through its summary may report no count, which is `null`, not zero. */
function waitingCountOf(forge: FleetDocumentForge): number | null {
  return forge.fidelity === 'counts-only' ? forge.attentionCount : forge.attention.length;
}

/** Gaia cannot talk to a forge whose system version is newer or older than the one it is built for, so it reads nothing of its work. */
function cannotTalkAtItsVersion(forge: FleetDocumentForge): boolean {
  return forge.versions?.verdict === 'newer' || forge.versions?.verdict === 'older';
}

/** A forge at a version Gaia cannot talk to reports no agent, so the totals leave its agents out and say so. */
function forgesWhoseAgentsAreNotCountedIn(fleetDocument: FleetDocument): FleetDocumentForge[] {
  return fleetDocument.forges.filter(cannotTalkAtItsVersion);
}

export const FleetDocumentUtil = {
  forgeOf,
  waitingCountOf,
  cannotTalkAtItsVersion,
  forgesWhoseAgentsAreNotCountedIn,
} as const;
