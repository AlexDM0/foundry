/**
 * The merge queue's facts in `BoardState`, which a client's merge queue view shows without ordering anything itself. What matters: each
 * target lists its waiting candidates in the five-key order from git's predictions, with the conflicts each causes; the Airlock holder and
 * its phase; the open `target-moved` decisions of the target's tickets; with merge approval on, each ticket waiting for User's accept
 * with its prediction against the target, and no candidate User did not accept; and a reading without forecasting leaves the targets empty.
 */
import { describe, expect, test } from 'bun:test';

import type { MergeTargetOf }                        from '../../lib/tracker-model/AirlockClaims.ts';
import { boardFixture, ticketFixture }               from '../../testing/BoardFixtures.ts';
import { EXAMPLE_GREEN_TREE, queueOnCurrentGreen }   from '../../testing/GreenQueue.ts';
import { BoardStateAssembly, type MergeForecasting } from './BoardState.ts';

const AT = '2026-10-28T10:00:00+01:00';

const targetOf: MergeTargetOf = (ticket) => (ticket.group === undefined || ticket.releasesGroup === true ? 'main' : `group-${ticket.group}`);

function queuedBoard(): ReturnType<typeof boardFixture>['board'] {
  const { board } = boardFixture({
    tickets: [
      ticketFixture({ id: '001', status: 'in-review' }),
      ticketFixture({ id: '002', status: 'in-review' }),
      ticketFixture({ id: '003', status: 'in-review', priority: 'high' }),
      ticketFixture({ id: '004', status: 'in-review' }),
    ],
  });
  for (const ticketId of ['001', '002', '003', '004']) queueOnCurrentGreen(board, ticketId, 'main', AT);
  return board;
}

/** 001 conflicts with main; 002 and 004 are clean but conflict with each other, and 004 also with 003. */
const FORECASTING: MergeForecasting = {
  targetOf,
  branchTreeOf: () => EXAMPLE_GREEN_TREE,
  forecastsOf:  (_target, ticketIds) => ({
    againstTarget: Object.fromEntries(ticketIds.map((ticketId) => [ticketId, ticketId === '001'
      ? { forecast: 'conflicting' as const, conflictedFiles: ['src/Example.ts'] }
      : { forecast: 'clean' as const, conflictedFiles: [] }])),
    pairwiseConflicts: [['002', '004'], ['003', '004']],
  }),
};

describe('BoardStateAssembly.mergeQueueOf', () => {
  test('orders a target\'s candidates by priority, clean first, fewest conflicts caused, then readiness', () => {
    const { targets } = BoardStateAssembly.mergeQueueOf(queuedBoard(), FORECASTING);
    expect(targets.map((target) => target.target)).toEqual(['main']);
    expect(targets[0]?.order.map((entry) => [entry.ticketId, entry.againstTarget, entry.conflictsCaused])).toEqual([
      ['003', 'clean', 1], ['002', 'clean', 1], ['004', 'clean', 2], ['001', 'conflicting', 0],
    ]);
    expect(targets[0]?.order[3]?.conflictedFiles).toEqual(['src/Example.ts']);
    expect(targets[0]?.holder).toBeNull();
  });

  test('names the Airlock holder with its phase and only the target-moved decisions of the target\'s tickets', () => {
    const board = queuedBoard();
    const { job } = board.claimAirlock({
      ticketId: '003', target: 'main', targetTip: 'a'.repeat(40), branchTip: 'b'.repeat(40), predictedConflictFiles: []
    }, targetOf, () => EXAMPLE_GREEN_TREE, AT);
    for (const kind of ['target-moved', 'merge-refused'] as const) {
      board.openDecision({
        kind,
        ticketIds: ['002'],
        jobId:     null,
        askedBy:   'overseer',
        requestId: null,
        questions: [{
          question: `Example ${kind}?`, header: 'Example', multiSelect: false, options: []
        }],
        context: 'main moved'
      }, AT);
    }
    const [target] = BoardStateAssembly.mergeQueueOf(board, FORECASTING).targets;
    expect(target?.holder).toEqual({ jobId: job.id, ticketIds: ['003'], phase: 'merge-in' });
    expect(target?.targetMovedDecisionIds).toEqual(['E1']);
  });

  test('with merge approval on, a ticket User did not accept waits for merge with its prediction and is no candidate', () => {
    const board = queuedBoard();
    board.setApproval('merge', true, AT);
    board.setTicketMergeAccepted('003', true, AT);
    const [target] = BoardStateAssembly.mergeQueueOf(board, FORECASTING).targets;
    expect(target?.order.map((entry) => entry.ticketId)).toEqual(['003']);
    expect(target?.waitingForMerge).toEqual([
      {
        ticketId: '001', priority: 'normal', againstTarget: 'conflicting', conflictedFiles: ['src/Example.ts']
      },
      {
        ticketId: '002', priority: 'normal', againstTarget: 'clean', conflictedFiles: []
      },
      {
        ticketId: '004', priority: 'normal', againstTarget: 'clean', conflictedFiles: []
      },
    ]);
    expect(target?.pairwiseConflicts).toEqual([]);
  });

  test('a waiting ticket whose prediction failed is named prediction-failed, and with merge approval off nothing waits', () => {
    const board = queuedBoard();
    const failing: MergeForecasting = { ...FORECASTING, forecastsOf: () => ({ againstTarget: {}, pairwiseConflicts: [] }) };
    expect(BoardStateAssembly.mergeQueueOf(board, failing).targets[0]?.waitingForMerge).toEqual([]);
    board.setApproval('merge', true, AT);
    expect(BoardStateAssembly.mergeQueueOf(board, failing).targets[0]?.waitingForMerge.map((entry) => [entry.ticketId, entry.againstTarget, entry.conflictedFiles]))
      .toEqual([['001', 'prediction-failed', null], ['002', 'prediction-failed', null], ['003', 'prediction-failed', null], ['004', 'prediction-failed', null]]);
  });

  test('a reading without forecasting leaves the targets empty and keeps the queued tickets', () => {
    expect(BoardStateAssembly.mergeQueueOf(queuedBoard(), null)).toEqual({ queuedTicketIds: ['001', '002', '003', '004'], slots: [], targets: [] });
  });
});
