/**
 * Which habitat is "the component the user works in", by the host's visit-target policy: a built-in strategy, or the host's own function.
 * Only a roomy habitat is a candidate, and a host function that answers anything else visits none.
 */
import type { RegisteredHabitat, VisitTargetPolicy } from '../SpriteHabitat.ts';

export interface VisitCandidate {
  readonly id:                    string;
  readonly registered:            RegisteredHabitat;
  readonly isRoomy:               boolean;
  /** Pixels squared: of two habitats below the pointer, the smaller is the inner one. */
  readonly area:                  number;
  readonly containsPointer:       boolean;
  /** Higher is later; null was never focused or clicked. */
  readonly focusedOrClickedOrder: number | null;
  /** Higher is later; null never changed. */
  readonly changedOrder:          number | null;
}

function latestBy(candidates: readonly VisitCandidate[], orderOf: (candidate: VisitCandidate) => number | null): VisitCandidate | null {
  let latest: VisitCandidate | null = null;
  let latestOrder = -Infinity;
  for (const candidate of candidates) {
    const order = orderOf(candidate);
    if (order !== null && order > latestOrder) {
      latest = candidate;
      latestOrder = order;
    }
  }
  return latest;
}

function chosenCandidateOf(policy: VisitTargetPolicy, roomy: readonly VisitCandidate[]): VisitCandidate | null {
  if (typeof policy === 'function') {
    const chosen = policy(roomy.map((candidate) => candidate.registered));
    return roomy.find((candidate) => candidate.registered.element === chosen?.element) ?? null;
  }
  switch (policy) {
    case 'last-focused-or-clicked':
      return latestBy(roomy, (candidate) => candidate.focusedOrClickedOrder);
    case 'content-changed-last':
      return latestBy(roomy, (candidate) => candidate.changedOrder);
    case 'under-pointer':
      return latestBy(roomy, (candidate) => (candidate.containsPointer ? -candidate.area : null));
  }
}

export function visitTargetIdOf(policy: VisitTargetPolicy, candidates: readonly VisitCandidate[]): string | null {
  return chosenCandidateOf(policy, candidates.filter((candidate) => candidate.isRoomy))?.id ?? null;
}
