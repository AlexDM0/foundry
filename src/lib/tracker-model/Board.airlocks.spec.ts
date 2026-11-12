/**
 * The Airlock's claim on the board. What matters: the queue is re-derived inside the hold, so a strictly higher priority queued since
 * the prediction is never jumped, a held slot is never claimed twice, and a claim writes the slot on the merge job it launches. A green
 * is current only under the phase hash it was recorded with and with its phase stored: a row from before the phase existed fails closed.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, refusalDetailOf, ticketFixture } from '../../testing/BoardFixtures.ts';
import { EXAMPLE_GREEN_TREE, queueOnCurrentGreen }      from '../../testing/GreenQueue.ts';
import { GATE_PHASES }                                  from './@types/GatePhase.ts';
import type { BranchTreeOf, MergeTargetOf }             from './AirlockClaims.ts';
import { PipelineUtil }                                 from './utils/PipelineUtil.ts';

const AT = '2026-10-28T10:00:00+01:00';

const targetOf: MergeTargetOf = (ticket) => (ticket.group === undefined || ticket.releasesGroup === true ? 'main' : `group-${ticket.group}`);

const branchTreeOf: BranchTreeOf = () => EXAMPLE_GREEN_TREE;

const OTHER_TREE = '1111111111111111111111111111111111111111';

describe('admitting only a current green to the Airlock', () => {
  test('a queued ticket whose branch HEAD tree is not its green tree is no candidate, and waits for a gate run instead', () => {
    const board = queuedBoard();
    const movedTree: BranchTreeOf = (ticketId) => (ticketId === '002' ? OTHER_TREE : EXAMPLE_GREEN_TREE);
    expect(board.mergeCandidatesOf('main', targetOf, movedTree).map((candidate) => candidate.ticketId)).toEqual(['001', '003']);
    expect(board.ticketsAwaitingGreenOf('main', targetOf, movedTree)).toEqual([{ ticketId: '002', queued: true }]);
    expect(refusalDetailOf(() => board.claimAirlock(claimOf('002'), targetOf, movedTree, AT))).toEqual({ reason: 'merge-candidate-not-queued', ticketId: '002', target: 'main' });
  });

  test('a changed pipeline makes every recorded green stale: no candidate is admitted, and every queued ticket waits for a gate run', () => {
    const board = queuedBoard();
    board.addGate({ name: 'tests', run: 'bun test' }, AT);
    expect(board.mergeCandidatesOf('main', targetOf, branchTreeOf)).toEqual([]);
    expect(board.ticketsAwaitingGreenOf('main', targetOf, branchTreeOf).map((awaiting) => awaiting.ticketId)).toEqual(['001', '002', '003']);
  });

  test('queuing is refused unless the green is current on the HEAD tree given, and a red run removes the green', () => {
    const board = queuedBoard();
    board.setTicketMergeQueued('001', false, AT);
    const refusal = refusalDetailOf(() => board.queueTicketForMerge('001', 'main', OTHER_TREE, AT));
    expect(refusal).toEqual({ reason: 'merge-queue-without-a-current-green', ticketId: '001', headTree: OTHER_TREE });
    board.recordPipelineJudgedBy('001', null, 'review', AT);
    expect(board.greenIsCurrent('001', EXAMPLE_GREEN_TREE, 'review')).toBe(false);
    expect(refusalDetailOf(() => board.queueTicketForMerge('001', 'main', EXAMPLE_GREEN_TREE, AT))).toMatchObject({ reason: 'merge-queue-without-a-current-green' });
  });
});

describe('the phase of a green', () => {
  test('a gate run records its phase and that phase\'s hash on the row, and no pipeline removes both with the green', () => {
    const { board, progress } = queuedFixture();
    const pipeline            = board.pipeline();
    if (pipeline === null) throw new Error('the fixture stores a pipeline');
    expect(progress.tasks[0]).toMatchObject({ greenPhase: 'review', pipelineHash: PipelineUtil.phaseHashOf(pipeline, 'review'), greenTree: EXAMPLE_GREEN_TREE });

    board.recordPipelineJudgedBy('001', EXAMPLE_GREEN_TREE, 'merge', AT);
    expect(progress.tasks[0]).toMatchObject({ greenPhase: 'merge', pipelineHash: PipelineUtil.phaseHashOf(pipeline, 'merge') });
  });

  test('a row with a pipelineHash and no greenPhase is stale: it is no candidate, it waits for a gate run, and it cannot be queued', () => {
    const { board, progress } = queuedFixture();
    const [row]               = progress.tasks;
    if (row === undefined) throw new Error('the fixture files a row for each ticket');
    delete row.greenPhase;

    expect(board.greenPhaseOf('001')).toBeNull();
    for (const phase of GATE_PHASES) expect(board.greenIsCurrent('001', EXAMPLE_GREEN_TREE, phase)).toBe(false);
    expect(board.mergeCandidatesOf('main', targetOf, branchTreeOf).map((candidate) => candidate.ticketId)).toEqual(['002', '003']);
    expect(board.ticketsAwaitingGreenOf('main', targetOf, branchTreeOf)).toEqual([{ ticketId: '001', queued: true }]);
    board.setTicketMergeQueued('001', false, AT);
    expect(refusalDetailOf(() => board.queueTicketForMerge('001', 'main', EXAMPLE_GREEN_TREE, AT))).toMatchObject({ reason: 'merge-queue-without-a-current-green' });
  });

  test('a green stays current in a phase whose gates are the ones it passed, and goes stale only where the gates changed', () => {
    const { board } = queuedFixture();
    board.addGate({ name: 'smoke', run: 'bun run smoke' }, AT, ['merge']);

    expect(board.greenIsCurrent('001', EXAMPLE_GREEN_TREE, 'review')).toBe(true);
    expect(board.greenIsCurrent('001', EXAMPLE_GREEN_TREE, 'build')).toBe(true);
    expect(board.greenIsCurrent('001', EXAMPLE_GREEN_TREE, 'merge')).toBe(false);
  });
});

function queuedBoard(): ReturnType<typeof boardFixture>['board'] {
  return queuedFixture().board;
}

function queuedFixture(): ReturnType<typeof boardFixture> {
  const fixture = boardFixture({
    tickets: [
      ticketFixture({ id: '001', status: 'in-review' }),
      ticketFixture({ id: '002', status: 'in-review', priority: 'high' }),
      ticketFixture({ id: '003', status: 'in-review', priority: 'low' }),
    ],
  });
  for (const ticketId of ['001', '002', '003']) queueOnCurrentGreen(fixture.board, ticketId, 'main', AT);
  return fixture;
}

function claimOf(ticketId: string): Parameters<ReturnType<typeof boardFixture>['board']['claimAirlock']>[0] {
  return {
    ticketId, target: 'main', targetTip: 'a'.repeat(40), branchTip: 'b'.repeat(40), predictedConflictFiles: []
  };
}

describe('claiming the main line\'s Airlock', () => {
  test('refuses higher-priority-queued while a strictly higher priority candidate waits, naming it', () => {
    const board = queuedBoard();
    const refusal = refusalDetailOf(() => board.claimAirlock(claimOf('001'), targetOf, branchTreeOf, AT));
    expect(refusal).toEqual({ reason: 'higher-priority-queued', ticketId: '001', queuedTicketIds: ['002'] });
  });

  test('takes the highest priority, writing the slot in its merge-in phase on the merge job it launches', () => {
    const board = queuedBoard();
    const { job } = board.claimAirlock(claimOf('002'), targetOf, branchTreeOf, AT);
    expect(job).toMatchObject({
      kind:      'merge',
      state:     'merging',
      ticketIds: ['002'],
      airlock:   {
        target: 'main', targetTip: 'a'.repeat(40), branchTip: 'b'.repeat(40), phase: 'merge-in'
      }
    });
  });

  test('refuses airlock-held while a merge job holds the target, and a ticket not queued', () => {
    const board = queuedBoard();
    const { job } = board.claimAirlock(claimOf('002'), targetOf, branchTreeOf, AT);
    expect(refusalDetailOf(() => board.claimAirlock(claimOf('001'), targetOf, branchTreeOf, AT))).toEqual({ reason: 'airlock-held', target: 'main', jobId: job.id });
    board.endJob(job.id, { outcome: 'landed' }, AT);
    board.setTicketMergeQueued('002', false, AT);
    const refusal = refusalDetailOf(() => board.claimAirlock(claimOf('002'), targetOf, branchTreeOf, AT));
    expect(refusal).toEqual({ reason: 'merge-candidate-not-queued', ticketId: '002', target: 'main' });
  });

  test('a candidate with a merge job of its own, or a landing-refused decision, is no candidate', () => {
    const board = queuedBoard();
    board.openDecision({
      kind:      'landing-refused',
      ticketIds: ['002'],
      jobId:     null,
      askedBy:   'overseer',
      requestId: null,
      questions: [{
        question: 'Example?', header: 'Example', multiSelect: false, options: []
      }],
      context: 'acceptance-unaccounted'
    }, AT);
    expect(board.mergeCandidatesOf('main', targetOf, branchTreeOf).map((candidate) => candidate.ticketId)).toEqual(['001', '003']);
  });
});

function groupBoard(integratedStatus: 'in-review' | 'reviewed'): ReturnType<typeof boardFixture>['board'] {
  const { board } = boardFixture({
    tickets: [
      ticketFixture({
        id: '010', status: integratedStatus, group: 'example', priority: 'high'
      }),
      ticketFixture({
        id: '011', status: 'reviewed', group: 'example', dependsOn: ['010']
      }),
      ticketFixture({
        id: '012', status: 'in-review', group: 'example', dependsOn: ['011'], releasesGroup: true
      }),
    ],
  });
  queueOnCurrentGreen(board, '012', 'main', AT);
  return board;
}

describe('a group\'s release and refresh on the board', () => {
  test('the release ticket targets main only once its bundle, walked through dependsOn, integrated, carrying the bundle\'s highest priority', () => {
    expect(groupBoard('in-review').mergeCandidatesOf('main', targetOf, branchTreeOf)).toEqual([]);
    const board = groupBoard('reviewed');
    expect(board.mergeCandidatesOf('main', targetOf, branchTreeOf)).toMatchObject([{ ticketId: '012', priority: 'high' }]);
    expect(board.mergeCandidatesOf('group-example', targetOf, branchTreeOf)).toEqual([]);
    expect(board.releaseBundleTicketIdsOf('example')).toEqual(['012', '011', '010']);
  });

  test('a refresh holds the group\'s slot, so a second is refused and the release waits until it ends', () => {
    const board = groupBoard('reviewed');
    board.setTicketMergeQueued('012', false, AT);
    const { job } = board.claimRefreshSlot({
      group: 'example', target: 'group-example', targetTip: 'a'.repeat(40), mainTip: 'c'.repeat(40)
    }, AT);
    expect(job).toMatchObject({
      kind:      'refresh',
      ticketIds: [],
      state:     'merging',
      airlock:   {
        target: 'group-example', targetTip: 'a'.repeat(40), branchTip: 'c'.repeat(40), phase: 'merge-in'
      }
    });
    expect(refusalDetailOf(() => board.claimRefreshSlot({
      group: 'example', target: 'group-example', targetTip: 'a'.repeat(40), mainTip: 'c'.repeat(40)
    }, AT))).toEqual({ reason: 'airlock-held', target: 'group-example', jobId: job.id });
    queueOnCurrentGreen(board, '012', 'main', AT);
    expect(board.mergeCandidatesOf('main', targetOf, branchTreeOf)).toEqual([]);
    board.endJob(job.id, { outcome: 'refreshed' }, AT);
    expect(board.mergeCandidatesOf('main', targetOf, branchTreeOf).map((candidate) => candidate.ticketId)).toEqual(['012']);
  });

  test('no refresh is claimed once the group\'s release ticket is queued', () => {
    const board = groupBoard('reviewed');
    expect(refusalDetailOf(() => board.claimRefreshSlot({
      group: 'example', target: 'group-example', targetTip: 'a'.repeat(40), mainTip: 'c'.repeat(40)
    }, AT))).toEqual({ reason: 'refresh-beside-a-queued-release', group: 'example', releaseTicketId: '012' });
  });
});
