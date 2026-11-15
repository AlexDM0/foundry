/**
 * The one way a caller turns an argv into a line to run: a port answering `unavailable` refuses it, so no caller can run the argv the port
 * hands back unchanged.
 */
import type { ConfinementPlan, GateConfinement } from './GateConfinement.ts';

export type ConfinedLine =
  | { readonly verdict: 'runs'; readonly argv: readonly string[] }
  | { readonly verdict: 'refused'; readonly reason: string };

export function confinedLineOf(confinement: GateConfinement, planOf: () => ConfinementPlan, argv: readonly string[]): ConfinedLine {
  const availability = confinement.availability();
  if (availability.verdict === 'unavailable') return { verdict: 'refused', reason: availability.reason };
  return { verdict: 'runs', argv: confinement.confinedArgvOf(planOf(), argv) };
}
