/**
 * The bar a launched reviewer starts, on the entity-forge fixture's pipeline where the shop crosses into the package. What matters: a
 * reviewer of a stage starts a bar that stores its stage, named by the review of the stage's entity with the entity before it and numbered
 * by the job's round within the stage; a reviewer on a forge without entities starts the bar it always started, named by the forge's review.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }                                from '../../lib/tracker-model/@types/Pipeline.ts';
import type { Task }                                    from '../../lib/tracker-model/@types/Task.ts';
import { PipelineUtil }                                 from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { boardFixture, ticketFixture }                  from '../../testing/BoardFixtures.ts';
import { ENTITY_FORGE_ENTITIES, entityForgePipelineOf } from '../../testing/EntityForgeFixture.ts';
import type { TrackerChange }                           from '../tracker/TrackerPipeline.ts';
import { JobLaunch, type JobLaunchContext }             from './JobLaunch.ts';

const AT = '2026-11-17T16:00:00+01:00';

const { SHOP, UI_KIT } = ENTITY_FORGE_ENTITIES;

/** Ticket 001 of the shop with a reviewer launched in round `round`, in `entity` at `stage` when given, and its first observation applied. */
function barOfALaunchedReviewer(pipeline: Pipeline, round: number, entityStage?: { entity: string; stage: number }): Task | undefined {
  const { board, progress } = boardFixture({ pipeline, tickets: [ticketFixture({ id: '001', status: 'in-progress', entity: SHOP.key })] });
  const { job } = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: round, target: 'main', ...entityStage
  }, AT);
  const context = { workspace: { rootDirectory: '/example', trackerDirectory: '/example/.forge' }, log: () => undefined } as unknown as JobLaunchContext;
  JobLaunch.applyBuildJobObservations({ board, at: AT } as unknown as TrackerChange, context, [{
    jobId:            job.id,
    setup:            'creating-worktree',
    calls:            0,
    report:           undefined,
    agentEnd:         null,
    gate:             { verdict: 'pending' },
    sandboxRefusal:   null,
    targetCatchUp:    { verdict: 'not-checked' },
    mainMerge:        null,
    conflictReReview: null,
  }]);
  return progress.tasks.find((task) => task.reviewOf === '001');
}

describe('the bar a launched reviewer starts', () => {
  test('stores the stage, carries its entity and the entity\'s review name, and takes the round within the stage', () => {
    const bar = barOfALaunchedReviewer(entityForgePipelineOf('shop-crosses-into-ui-kit'), 2, { entity: UI_KIT.key, stage: 3 });

    expect(bar).toMatchObject({ name: 'Review 2 #001 — Example checkout page (ui-kit: review)', reviewBarRound: 2, stage: { name: 'package-review', entity: UI_KIT.key }, });
  });

  test('on a forge without entities is named by the forge\'s review and stores no stage', () => {
    const bar = barOfALaunchedReviewer({ ...PipelineUtil.minimalPipelineOf(), review: { name: 'Security pass' } }, 1);

    expect(bar?.name).toBe('Review 1 #001 — Example checkout page (Security pass)');
    expect(bar === undefined ? null : Object.hasOwn(bar, 'stage')).toBe(false);
  });
});
