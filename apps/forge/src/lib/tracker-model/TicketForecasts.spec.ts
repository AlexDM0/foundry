/**
 * The ticket forecast the Overseer serves. What matters: only a pending, in-progress or in-review ticket has one, and none while no pipeline
 * is set, since nothing launches then; the steps start at the step under way, named by its live job and marked current, or at the next one
 * with nothing current; Customs and its gates name the build phase's gates; a review phase that is not set adds no review step, and merge
 * approval adds a step only until User accepted; a group's ticket integrates into its group's branch while its release ticket lands; the
 * attempt and round are the Playbook's own, so a builder a review sent back keeps its attempt; targets are `null` without a target rule; and
 * a dependent lists the other dependencies it still waits on, while an unready ticket is no dependent. On a pipeline with entities, Customs
 * names the build gates of the ticket's own entity, never the forge's empty top level.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, ticketFixture }             from '../../testing/BoardFixtures.ts';
import { EXAMPLE_GREEN_TREE, queueOnCurrentGreen } from '../../testing/GreenQueue.ts';
import type { JobLaunch }                          from './@types/Job.ts';
import type { Pipeline, PipelineEntity }           from './@types/Pipeline.ts';
import type { Ticket, TicketStatus }               from './@types/Ticket.ts';
import type { TicketForecast }                     from './@types/TicketForecast.ts';
import type { MergeTargetOf }                      from './AirlockClaims.ts';
import type { Board }                              from './Board.ts';

const AT = '2026-11-10T10:00:00+01:00';

const targetOf: MergeTargetOf = (ticket) => (ticket.group === undefined || ticket.releasesGroup === true ? 'main' : `group-${ticket.group}`);

const PIPELINE_WITH_REVIEW: Pipeline = {
  version: 3,
  prepare: [],
  gates:   [{ name: 'typecheck', run: 'bun run typecheck' }, { name: 'test', run: 'bun test' }],
  phases:  { build: ['typecheck', 'test'], review: ['typecheck', 'test'], merge: ['typecheck', 'test'] },
  review:  { name: 'Review' },
};

const PIPELINE_WITHOUT_REVIEW: Pipeline = {
  version: 3, prepare: [], gates: [{ name: 'test', run: 'bun test' }], phases: { build: ['test'], review: ['test'], merge: ['test'] }
};

function launchOf(kind: 'build' | 'review', ticketId: string, attempt: number): JobLaunch {
  return {
    kind, role: kind === 'build' ? 'builder' : 'reviewer', ticketIds: [ticketId], parentJobId: null, attempt, target: 'main'
  };
}

function boardOf(tickets: Ticket[], pipeline: Pipeline | null = PIPELINE_WITH_REVIEW): Board {
  return boardFixture({ tickets, ...(pipeline === null ? {} : { pipeline }) }).board;
}

function forecastOf(board: Board, ticketId: string, rule: MergeTargetOf | null = targetOf): TicketForecast | undefined {
  return board.ticketForecastsOf(rule).find((forecast) => forecast.ticketId === ticketId);
}

describe('which tickets have a forecast', () => {
  test('only a pending, in-progress or in-review ticket, in board order', () => {
    const statuses: TicketStatus[] = ['draft', 'ready-for-review', 'pending', 'in-progress', 'in-review', 'reviewed', 'delivered', 'abandoned'];
    const board = boardOf(statuses.map((status, index) => ticketFixture({ id: `00${index + 1}`, status })));
    expect(board.ticketForecastsOf(targetOf).map((forecast) => forecast.ticketId)).toEqual(['003', '004', '005']);
  });

  test('none while no pipeline is set', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'pending' })], null);
    expect(board.ticketForecastsOf(targetOf)).toEqual([]);
  });
});

describe('the steps of a ticket nothing runs on', () => {
  test('a pending ticket goes through a build, Customs and its gates, a first review round and its landing, none of it current', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'pending' })]);
    expect(forecastOf(board, '001')).toEqual({
      ticketId: '001',
      steps:    [
        { kind: 'build', attempt: 1, jobId: null },
        { kind: 'customs-and-gates', gateNames: ['typecheck', 'test'], jobId: null },
        { kind: 'review', round: 1, jobId: null },
        { kind: 'land', target: 'main' },
      ],
      currentStepIndex: null,
      dependents:       [],
    });
  });

  test('Customs and its gates name the build phase\'s gates in that phase\'s run order, never a gate only another phase runs', () => {
    const pipeline: Pipeline = {
      ...PIPELINE_WITH_REVIEW,
      gates:  [...PIPELINE_WITH_REVIEW.gates, { name: 'audit', run: 'bun run audit' }],
      phases: { build: ['test', 'typecheck'], review: ['typecheck', 'test', 'audit'], merge: ['audit'] },
    };
    const board = boardOf([ticketFixture({ id: '001', status: 'pending' })], pipeline);
    expect(forecastOf(board, '001')?.steps[1]).toEqual({ kind: 'customs-and-gates', gateNames: ['test', 'typecheck'], jobId: null });
  });

  test('on a pipeline with entities, Customs names the build gates of the ticket\'s own entity, not the forge\'s top level', () => {
    const entityOf = (gateName: string, home: string): PipelineEntity => ({
      kind:    'app',
      home:    [home],
      prepare: [],
      gates:   [{ name: gateName, run: `bun run ${gateName}` }],
      phases:  { build: [gateName], review: [], merge: [gateName] },
    });
    const pipeline: Pipeline = { ...PIPELINE_WITHOUT_REVIEW, entities: { 'web': entityOf('gate:web', '/apps/web'), 'api': entityOf('gate:api', '/apps/api') } };
    const board = boardOf([ticketFixture({ id: '001', status: 'pending', entity: 'web' }), ticketFixture({ id: '002', status: 'pending', entity: 'api' })], pipeline);
    expect(forecastOf(board, '001')?.steps[1]).toEqual({ kind: 'customs-and-gates', gateNames: ['gate:web'], jobId: null });
    expect(forecastOf(board, '002')?.steps[1]).toEqual({ kind: 'customs-and-gates', gateNames: ['gate:api'], jobId: null });
  });

  test('an in-progress ticket whose build failed launches the next attempt', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'in-progress' })]);
    const { job } = board.launchJob(launchOf('build', '001', 1), AT);
    board.endJob(job.id, { outcome: 'failed' }, AT);
    expect(forecastOf(board, '001')?.steps[0]).toEqual({ kind: 'build', attempt: 2, jobId: null });
    expect(forecastOf(board, '001')?.currentStepIndex).toBeNull();
  });

  test('a builder a review sent back keeps its attempt, as the Playbook resumes it', () => {
    const tickets = [ticketFixture({ id: '001', status: 'in-progress' })];
    const board   = boardOf(tickets);
    const build   = board.launchJob(launchOf('build', '001', 1), AT).job;
    board.endJob(build.id, { outcome: 'built' }, AT);
    const review = board.launchJob(launchOf('review', '001', 1), AT).job;
    board.endJob(review.id, { outcome: 'does-not-hold' }, AT);
    expect(forecastOf(board, '001')?.steps[0]).toEqual({ kind: 'build', attempt: 1, jobId: null });
  });

  test('an in-review ticket takes the review round after the rounds granted', () => {
    const board  = boardOf([ticketFixture({ id: '001', status: 'in-review' })]);
    const review = board.launchJob(launchOf('review', '001', 1), AT).job;
    board.endJob(review.id, { outcome: 'round-granted' }, AT);
    expect(forecastOf(board, '001')?.steps).toEqual([{ kind: 'review', round: 2, jobId: null }, { kind: 'land', target: 'main' }]);
  });

  test('an in-review ticket queued to land waits only for its landing', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'in-review' })]);
    queueOnCurrentGreen(board, '001', 'main', AT);
    expect(forecastOf(board, '001')?.steps).toEqual([{ kind: 'land', target: 'main' }]);
  });
});

describe('the step under way', () => {
  test('a running build is the current first step, named by its job and attempt', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'in-progress' })]);
    const { job } = board.launchJob(launchOf('build', '001', 1), AT);
    board.moveJob(job.id, 'running', AT);
    const forecast = forecastOf(board, '001');
    expect(forecast?.steps.slice(0, 2)).toEqual([
      { kind: 'build', attempt: 1, jobId: job.id },
      { kind: 'customs-and-gates', gateNames: ['typecheck', 'test'], jobId: null },
    ]);
    expect(forecast?.currentStepIndex).toBe(0);
  });

  test('a build job in Customs makes Customs and its gates the current first step', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'in-progress' })]);
    const { job } = board.launchJob(launchOf('build', '001', 1), AT);
    board.moveJob(job.id, 'running', AT);
    board.moveJob(job.id, 'in-customs', AT);
    expect(forecastOf(board, '001')?.steps[0]).toEqual({ kind: 'customs-and-gates', gateNames: ['typecheck', 'test'], jobId: job.id });
    expect(forecastOf(board, '001')?.currentStepIndex).toBe(0);
  });

  test('a running review is the current first step, its round the job\'s attempt', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'in-review' })]);
    const { job } = board.launchJob(launchOf('review', '001', 2), AT);
    expect(forecastOf(board, '001')).toMatchObject({
      steps:            [{ kind: 'review', round: 2, jobId: job.id }, { kind: 'land', target: 'main' }],
      currentStepIndex: 0,
    });
  });

  test('a merge job holding the Airlock makes the landing the current step', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'in-review' })]);
    queueOnCurrentGreen(board, '001', 'main', AT);
    board.claimAirlock({
      ticketId: '001', target: 'main', targetTip: 'a'.repeat(40), branchTip: 'b'.repeat(40), predictedConflictFiles: []
    }, targetOf, () => EXAMPLE_GREEN_TREE, AT);
    expect(forecastOf(board, '001')).toMatchObject({ steps: [{ kind: 'land', target: 'main' }], currentStepIndex: 0 });
  });
});

describe('what the pipeline and the targets add', () => {
  test('a pipeline with no review phase adds no review step', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'pending' })], PIPELINE_WITHOUT_REVIEW);
    expect(forecastOf(board, '001')?.steps.map((step) => step.kind)).toEqual(['build', 'customs-and-gates', 'land']);
  });

  test('merge approval adds User\'s accept into the target before the landing, until User accepted', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'pending' }), ticketFixture({ id: '002', status: 'in-review' })]);
    board.setApproval('merge', true, AT);
    queueOnCurrentGreen(board, '002', 'main', AT);
    expect(forecastOf(board, '001')?.steps.slice(-2)).toEqual([{ kind: 'merge-approval', target: 'main' }, { kind: 'land', target: 'main' }]);
    expect(forecastOf(board, '002')?.steps).toEqual([{ kind: 'merge-approval', target: 'main' }, { kind: 'land', target: 'main' }]);
    board.setTicketMergeAccepted('002', true, AT);
    expect(forecastOf(board, '002')?.steps).toEqual([{ kind: 'land', target: 'main' }]);
  });

  test('a group\'s ticket integrates into its group\'s branch, and its release ticket lands', () => {
    const board = boardOf([
      ticketFixture({ id: '001', status: 'pending', group: 'account' }),
      ticketFixture({
        id: '002', status: 'pending', group: 'account', releasesGroup: true
      }),
    ]);
    expect(forecastOf(board, '001')?.steps.at(-1)).toEqual({ kind: 'integrate', target: 'group-account', group: 'account' });
    expect(forecastOf(board, '002')?.steps.at(-1)).toEqual({ kind: 'land', target: 'main' });
  });

  test('without a target rule every target is null', () => {
    const board = boardOf([ticketFixture({ id: '001', status: 'pending', group: 'account' }), ticketFixture({ id: '002', status: 'pending' })]);
    board.setApproval('merge', true, AT);
    expect(forecastOf(board, '001', null)?.steps.slice(-2)).toEqual([
      { kind: 'merge-approval', target: null },
      { kind: 'integrate', target: null, group: 'account' },
    ]);
    expect(forecastOf(board, '002', null)?.steps.at(-1)).toEqual({ kind: 'land', target: null });
  });
});

describe('the dependents', () => {
  test('a dependent lists the other unsettled dependencies it still waits on', () => {
    const board = boardOf([
      ticketFixture({ id: '001', status: 'in-progress' }),
      ticketFixture({ id: '002', status: 'pending' }),
      ticketFixture({ id: '003', status: 'reviewed' }),
      ticketFixture({ id: '004', status: 'pending', dependsOn: ['001'] }),
      ticketFixture({ id: '005', status: 'pending', dependsOn: ['001', '002', '003'] }),
    ]);
    expect(forecastOf(board, '001')?.dependents).toEqual([
      { ticketId: '004', stillWaitingOnTicketIds: [] },
      { ticketId: '005', stillWaitingOnTicketIds: ['002'] },
    ]);
  });

  test('an unready or closed ticket is no dependent', () => {
    const board = boardOf([
      ticketFixture({ id: '001', status: 'pending' }),
      ticketFixture({ id: '002', status: 'draft', dependsOn: ['001'] }),
      ticketFixture({ id: '003', status: 'ready-for-review', dependsOn: ['001'] }),
      ticketFixture({ id: '004', status: 'abandoned', dependsOn: ['001'] }),
    ]);
    expect(forecastOf(board, '001')?.dependents).toEqual([]);
  });
});
