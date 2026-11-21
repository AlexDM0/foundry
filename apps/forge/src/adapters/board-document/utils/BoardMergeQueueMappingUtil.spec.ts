/**
 * The board's merge queue against the contract's merge queue document. What matters: each target maps field by field with its holder, its
 * order, the tickets waiting for the user's accept, its conflicting pairs and its decisions; a failed prediction keeps `null` files; and
 * the slots Hephaestus keeps beside the targets, each a target's holder already, stay out.
 */
import { describe, expect, test } from 'bun:test';

import { BoardMergeQueueMappingUtil } from './BoardMergeQueueMappingUtil.ts';

describe('BoardMergeQueueMappingUtil.mergeQueueOf', () => {
  test('maps every target field by field and leaves the slots out', () => {
    const target = {
      target: 'main',
      holder: { jobId: 'J4', ticketIds: ['001'], phase: 'gating' },
      order:  [
        {
          ticketId: '002', priority: 'high', againstTarget: 'clean', conflictedFiles: [], conflictsCaused: 1
        },
        {
          ticketId: '003', priority: 'normal', againstTarget: 'prediction-failed', conflictedFiles: null, conflictsCaused: 0
        },
      ],
      waitingForMerge: [{
        ticketId: '004', priority: 'low', againstTarget: 'conflicting', conflictedFiles: ['src/a.ts']
      }],
      pairwiseConflicts:      [['002', '005']],
      targetMovedDecisionIds: ['E3'],
    } as const;
    const document = BoardMergeQueueMappingUtil.mergeQueueOf({
      queuedTicketIds: ['002', '003'],
      slots:           [{ jobId: 'J4', target: 'main', phase: 'gating' }],
      targets:         [{
        ...target,
        holder:                 { ...target.holder, ticketIds: [...target.holder.ticketIds] },
        order:                  target.order.map((entry) => ({ ...entry, conflictedFiles: entry.conflictedFiles === null ? null : [...entry.conflictedFiles] })),
        waitingForMerge:        target.waitingForMerge.map((entry) => ({ ...entry, conflictedFiles: [...entry.conflictedFiles] })),
        pairwiseConflicts:      [...target.pairwiseConflicts],
        targetMovedDecisionIds: [...target.targetMovedDecisionIds],
      }],
    });
    expect(document).toEqual({ queuedTicketIds: ['002', '003'], targets: [target] });
    expect(Object.hasOwn(document, 'slots')).toBe(false);
  });
});
