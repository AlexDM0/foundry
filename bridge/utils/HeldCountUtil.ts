/** `↦ N` wherever a ticket shows: how many open tickets wait on it, directly or further down the chain, and the title that says so. */
import type { DependencyGraph } from '../@types/DependencyGraph.ts';

type HeldGraph = Pick<DependencyGraph, 'heldOfNode'>;

/** How many tickets the graph holds back behind the ticket; 0 for one nothing waits on. */
function heldCountOf(ticketId: string, graph: HeldGraph): number {
  return graph.heldOfNode.get(ticketId)?.size ?? 0;
}

function heldTitleOf(heldCount: number): string {
  return `${heldCount} ${heldCount === 1 ? 'ticket waits' : 'tickets wait'} on this one, directly or further down the chain`;
}

export const HeldCountUtil = Object.freeze({ heldCountOf, heldTitleOf });
