/**
 * A crossing ticket's stages on the Board, on the entity-forge fixture's pipeline where the shop crosses into the package. What matters: the
 * Playbook reads the stage the ticket's row stores, so the job it launches runs in the stage's entity and number and the launch record names
 * both (an entity's cap counts jobs by them, E72); a review stage launches the package's reviewer; a ticket of the shop with no stage runs as
 * stage 1 of the shop; a forge without entities launches a job with neither key. Each review stage has its own bar: the bar stores its stage
 * and its name carries the stage's entity, its round counted within the stage, while a bar of a forge without entities stays as it was.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, taskFixture, ticketFixture }     from '../../testing/BoardFixtures.ts';
import { ENTITY_FORGE_ENTITIES, entityForgePipelineOf } from '../../testing/EntityForgeFixture.ts';
import type { Job }                                     from './@types/Job.ts';
import type { Pipeline }                                from './@types/Pipeline.ts';
import type { TicketStage }                             from './@types/Task.ts';
import type { Board }                                   from './Board.ts';
import { FIXTURE_LIMITS, FIXTURE_OBSERVATIONS }         from './testing/LifecycleFixtures.ts';
import { PipelineUtil }                                 from './utils/PipelineUtil.ts';

const AT = '2026-11-17T16:00:00+01:00';

const { SHOP, UI_KIT } = ENTITY_FORGE_ENTITIES;

const CROSSING_PIPELINE = entityForgePipelineOf('shop-crosses-into-ui-kit');

const PACKAGE_BUILD: TicketStage  = { name: 'package-build', entity: UI_KIT.key };
const PACKAGE_REVIEW: TicketStage = { name: 'package-review', entity: UI_KIT.key };
const HOME_REVIEW: TicketStage    = { name: 'review', entity: SHOP.key };

/** Ticket 001 of the shop with its row: in progress with the `stage` its row holds when given, else ready to build. */
function boardWithTheShopTicket(pipeline: Pipeline, stage?: TicketStage): Board {
  const { board } = boardFixture({
    pipeline,
    tasks: [taskFixture({
      id: 1, ticket: '001', status: stage === undefined ? 'pending' : 'in-progress', ...(stage === undefined ? {} : { stage })
    })],
    tickets: [ticketFixture({
      id: '001', status: stage === undefined ? 'pending' : 'in-progress', task: 1, entity: SHOP.key
    })],
  });
  board.setOverseerState('running', AT);
  return board;
}

function ticketJobsAfterAPass(board: Board): Readonly<Job>[] {
  board.followPlaybook({ ...FIXTURE_LIMITS, now: AT }, FIXTURE_OBSERVATIONS, () => ({ questions: [], context: '' }));
  return board.jobs().filter((job) => job.ticketIds.includes('001'));
}

describe('a pass over a crossing ticket', () => {
  test('launches the job of the stage its row stores, in the stage\'s entity and number, and the launch record names both (E72)', () => {
    const board = boardWithTheShopTicket(CROSSING_PIPELINE, PACKAGE_BUILD);

    expect(ticketJobsAfterAPass(board)).toMatchObject([{
      kind: 'build', role: 'builder', entity: UI_KIT.key, stage: 2
    }]);
    expect(board.logRecordsSoFar().find((record) => record.kind === 'job-launched' && record.fields.kind === 'build')).toMatchObject({ fields: { entity: UI_KIT.key, stage: 2 }, });
  });

  test('launches the package\'s reviewer for the package review stage', () => {
    expect(ticketJobsAfterAPass(boardWithTheShopTicket(CROSSING_PIPELINE, PACKAGE_REVIEW))).toMatchObject([{
      kind: 'review', role: 'reviewer', attempt: 1, entity: UI_KIT.key, stage: 3
    }]);
  });

  test('runs a ticket of the shop with no stage as stage 1 of the shop', () => {
    expect(ticketJobsAfterAPass(boardWithTheShopTicket(CROSSING_PIPELINE))).toMatchObject([{ kind: 'build', entity: SHOP.key, stage: 1 }]);
  });

  test('on a forge without entities launches a job that names no entity and no stage', () => {
    const [job] = ticketJobsAfterAPass(boardWithTheShopTicket(PipelineUtil.minimalPipelineOf()));

    expect(job?.kind).toBe('build');
    expect(job === undefined ? [] : Object.keys(job).filter((key) => key === 'entity' || key === 'stage')).toEqual([]);
  });
});

describe('the review bars of a crossing ticket', () => {
  test('each review stage has its own bar, which stores its stage and carries its entity in its name, its round counted in the stage', () => {
    const { board, progress } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress', entity: SHOP.key })] });
    board.startReviewBar('001', { round: 2, label: 'review', stage: PACKAGE_REVIEW }, AT);
    board.startReviewBar('001', { round: 1, label: 'review', stage: HOME_REVIEW }, AT);
    const bars = progress.tasks.filter((task) => task.reviewOf === '001');

    expect(bars.map((bar) => [bar.name, bar.status, bar.reviewBarRound, bar.stage])).toEqual([
      ['Review 2 #001 — Example checkout page (ui-kit: review)', 'delivered', 2, PACKAGE_REVIEW],
      ['Review 1 #001 — Example checkout page (shop: review)', 'in-progress', 1, HOME_REVIEW],
    ]);
  });

  test('a bar of a stage without a review name carries its entity alone', () => {
    const { board, progress } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress', entity: SHOP.key })] });
    board.startReviewBar('001', { round: 1, stage: PACKAGE_REVIEW }, AT);

    expect(progress.tasks.find((task) => task.reviewOf === '001')?.name).toBe('Review 1 #001 — Example checkout page (ui-kit)');
  });

  test('a bar without a stage keeps its name and stores no stage', () => {
    const { board, progress } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-review' })] });
    board.startReviewBar('001', { round: 1, label: 'Security pass' }, AT);
    const bar = progress.tasks.find((task) => task.reviewOf === '001');

    expect(bar?.name).toBe('Review 1 #001 — Example checkout page (Security pass)');
    expect(bar === undefined ? null : Object.hasOwn(bar, 'stage')).toBe(false);
  });
});
