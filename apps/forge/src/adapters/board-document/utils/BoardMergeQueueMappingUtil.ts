/**
 * The board's merge queue mapped into the contract's board document: the queued tickets and, per target, its Airlock holder, its waiting
 * candidates in order, the tickets that wait for the user's accept, and the decisions its landings wait on.
 */
import type { BoardMergeQueueDocument, BoardMergeTargetDocument } from 'forge-contracts/BoardMergeQueueDocument';

import type { MergeQueueFacts, MergeTargetFacts } from '../../@types/BoardStateParts.ts';

function mergeTargetOf(target: MergeTargetFacts): BoardMergeTargetDocument {
  return {
    target: target.target,
    holder: target.holder === null ? null : { jobId: target.holder.jobId, ticketIds: [...target.holder.ticketIds], phase: target.holder.phase },
    order:  target.order.map((entry) => ({
      ticketId:        entry.ticketId,
      priority:        entry.priority,
      againstTarget:   entry.againstTarget,
      conflictedFiles: entry.conflictedFiles === null ? null : [...entry.conflictedFiles],
      conflictsCaused: entry.conflictsCaused,
    })),
    waitingForMerge: target.waitingForMerge.map((entry) => ({
      ticketId:        entry.ticketId,
      priority:        entry.priority,
      againstTarget:   entry.againstTarget,
      conflictedFiles: entry.conflictedFiles === null ? null : [...entry.conflictedFiles],
    })),
    pairwiseConflicts:      target.pairwiseConflicts.map(([first, second]) => [first, second] as const),
    targetMovedDecisionIds: [...target.targetMovedDecisionIds],
  };
}

/** The slots Hephaestus keeps beside the targets are each target's holder already. */
function mergeQueueOf(mergeQueue: MergeQueueFacts): BoardMergeQueueDocument {
  return {
    queuedTicketIds: [...mergeQueue.queuedTicketIds],
    targets:         mergeQueue.targets.map(mergeTargetOf),
  };
}

export const BoardMergeQueueMappingUtil = Object.freeze({
  mergeTargetOf,
  mergeQueueOf,
});
