/** What waits on User across forges, in PLAN 7.3's order: escalated entries first, then the oldest stamp first; a tie keeps the forges' own order. */
import type { FleetAttentionItem }          from '../../../shared/@types/FleetSnapshot.ts';
import type { ForgeFidelity, ForgeReading } from '../../../shared/@types/ForgeReading.ts';

/** An unreachable forge keeps its last full reading, so its entries stay listed as last reported (artboard B3). */
const FIDELITIES_THAT_LIST_ATTENTION: ReadonlySet<ForgeFidelity> = new Set<ForgeFidelity>(['full', 'unreachable']);

/** A stamp that does not parse sorts after every stamp that does, so it never pushes a readable entry down. */
function instantOf(stamp: string): number {
  const instant = Date.parse(stamp);
  return Number.isNaN(instant) ? Number.POSITIVE_INFINITY : instant;
}

/**
 * Stamps of different writers are compared to order a display only: the one stated exception to "a clock decides nothing" in Gaia (PLAN
 * 7.3). Nothing but the order of rows on screen depends on it.
 */
function oldestStampFirst(a: FleetAttentionItem, b: FleetAttentionItem): number {
  const aInstant = instantOf(a.stamp);
  const bInstant = instantOf(b.stamp);
  if (aInstant === bInstant) return 0;
  return aInstant < bInstant ? -1 : 1;
}

function escalatedFirst(a: FleetAttentionItem, b: FleetAttentionItem): number {
  const aIsEscalated = a.kind === 'escalated-question';
  const bIsEscalated = b.kind === 'escalated-question';
  if (aIsEscalated === bIsEscalated) return 0;
  return aIsEscalated ? -1 : 1;
}

function attentionInFleetOrder(a: FleetAttentionItem, b: FleetAttentionItem): number {
  return escalatedFirst(a, b) || oldestStampFirst(a, b);
}

/** Every listed entry of every forge, each with its forge; the sort is stable, so a tie keeps the forges' order and each forge's own order. */
function fleetAttentionOf(readings: readonly ForgeReading[]): FleetAttentionItem[] {
  return readings
    .filter((reading) => FIDELITIES_THAT_LIST_ATTENTION.has(reading.fidelity))
    .flatMap((reading) => reading.attention.map((item): FleetAttentionItem => ({ ...item, trackerId: reading.trackerId })))
    .sort(attentionInFleetOrder);
}

export const AttentionOrderUtil = {
  fleetAttentionOf,
  attentionInFleetOrder,
} as const;
