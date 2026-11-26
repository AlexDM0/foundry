/**
 * What the page reads off a fleet document the same way in every view: a forge by its tracker id, what of a forge and of the fleet waits on
 * User at the fidelity it was read at, and the forges whose agents no total counts. A forge's "no pipeline" question (`checks-not-set`) waits
 * on nobody: the forge's onboarding answers it, so no list or count of what waits on User holds it.
 */
import type {
  FleetDocument,
  FleetDocumentAttentionItem,
  FleetDocumentFleetAttentionItem,
  FleetDocumentForge
} from '../../@types/FleetDocument.ts';

/** The forge's "no pipeline" question: open while the forge has none, withdrawn by the setup's Apply. */
const NO_PIPELINE_DECISION_KIND = 'checks-not-set';

function forgeOf(fleetDocument: FleetDocument, trackerId: string): FleetDocumentForge | null {
  return fleetDocument.forges.find((forge) => forge.trackerId === trackerId) ?? null;
}

function isNoPipelineQuestion(item: FleetDocumentAttentionItem): boolean {
  return item.decisionKind === NO_PIPELINE_DECISION_KIND;
}

/** Whether the forge reported its "no pipeline" question, so it has no pipeline yet. */
function reportsNoPipeline(forge: FleetDocumentForge): boolean {
  return forge.attention.some(isNoPipelineQuestion);
}

/** What of the forge waits on User, as the forge last reported it. */
function attentionWaitingOnUserOf(forge: FleetDocumentForge): FleetDocumentAttentionItem[] {
  return forge.attention.filter((item) => !isNoPipelineQuestion(item));
}

/** What waits on User across the fleet, in the fleet's own order. */
function fleetAttentionWaitingOnUserOf(fleetDocument: FleetDocument): FleetDocumentFleetAttentionItem[] {
  return fleetDocument.attention.filter((item) => !isNoPipelineQuestion(item));
}

/** The fleet's count of what waits on User; it holds no forge's "no pipeline" question, which the fleet's attention lists. */
function waitingOnUserTotalOf(fleetDocument: FleetDocument): number {
  return fleetDocument.figures.waitingOnUser - fleetDocument.attention.filter(isNoPipelineQuestion).length;
}

/** What waits on User from the forge as the forge counts it; a forge read through its summary may report no count, which is `null`, not zero. */
function waitingCountOf(forge: FleetDocumentForge): number | null {
  return forge.fidelity === 'counts-only' ? forge.attentionCount : attentionWaitingOnUserOf(forge).length;
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
  reportsNoPipeline,
  attentionWaitingOnUserOf,
  fleetAttentionWaitingOnUserOf,
  waitingOnUserTotalOf,
  waitingCountOf,
  cannotTalkAtItsVersion,
  forgesWhoseAgentsAreNotCountedIn,
} as const;
