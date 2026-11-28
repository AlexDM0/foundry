/**
 * The ticket forecast held to the Playbook across seeded interleavings: before each pass a launched step is forecast first, after each
 * pass a live job's step is forecast first and current; the run proves it checked each kind and watches a mutant break the agreement.
 */
import { describe, expect, test } from 'bun:test';

import { mutatedModuleOf }                  from '../../testing/SourceMutant.ts';
import type { Job }                         from './@types/Job.ts';
import type { TicketForecast }              from './@types/TicketForecast.ts';
import { LifecycleWorld, type PassWitness } from './testing/LifecycleWorld.ts';

const WORLD_MODULE = 'src/domain/tracker-model/testing/LifecycleWorld.ts';

const SEEDS = 60;

const TURNS_PER_SEED = 60;

/** The step kinds a live job's forecast starts with, by the job's kind. */
const FIRST_STEP_KINDS_BY_JOB_KIND: Readonly<Partial<Record<Job['kind'], readonly string[]>>> = {
  'build':       ['build', 'customs-and-gates'],
  'review':      ['review'],
  'merge':       ['land', 'integrate'],
  'merge-agent': ['land', 'integrate'],
};

interface AgreementRun {
  disagreements: string[];
  checkedKinds:  Set<string>;
}

function forecastOf(forecasts: readonly TicketForecast[], ticketId: string): TicketForecast | undefined {
  return forecasts.find((forecast) => forecast.ticketId === ticketId);
}

/** The launches the pass took against the forecasts before it. */
function launchDisagreementsOf(witness: PassWitness, run: AgreementRun): void {
  for (const step of witness.steps) {
    if (step.kind !== 'launch-build' && step.kind !== 'launch-review') continue;
    const forecast = forecastOf(witness.forecastsBefore, step.ticketId);
    const expected = step.kind === 'launch-build' ? { kind: 'build', attempt: step.attempt, jobId: null } : { kind: 'review', round: step.round, jobId: null };
    run.checkedKinds.add(step.kind);
    if (forecast?.currentStepIndex !== null || !Bun.deepEquals(forecast.steps[0], expected)) {
      run.disagreements.push(`${step.kind} of ${step.ticketId} after the forecast ${JSON.stringify(forecast ?? null)}`);
    }
  }
}

/** The live jobs the pass left against the forecasts after it. */
function liveJobDisagreementsOf(witness: PassWitness, run: AgreementRun): void {
  for (const job of witness.jobsAfter) {
    const firstStepKinds = FIRST_STEP_KINDS_BY_JOB_KIND[job.kind];
    if (firstStepKinds === undefined) continue;
    for (const ticketId of job.ticketIds) {
      const forecast  = forecastOf(witness.forecastsAfter, ticketId);
      const firstStep = forecast?.steps[0];
      const namesJob  = firstStep !== undefined && (!('jobId' in firstStep) || firstStep.jobId === job.id);
      run.checkedKinds.add(job.kind);
      if (forecast?.currentStepIndex !== 0 || firstStep === undefined || !firstStepKinds.includes(firstStep.kind) || !namesJob) {
        run.disagreements.push(`${job.kind} job ${job.id} on ${ticketId} beside the forecast ${JSON.stringify(forecast ?? null)}`);
      }
    }
  }
}

function agreementRunOf(World: typeof LifecycleWorld, seed: number): AgreementRun {
  const run: AgreementRun = { disagreements: [], checkedKinds: new Set() };
  new World(seed, (witness) => {
    launchDisagreementsOf(witness, run);
    liveJobDisagreementsOf(witness, run);
  }).run(TURNS_PER_SEED);
  return run;
}

function seedNumbers(): number[] {
  return Array.from({ length: SEEDS }, (_unused, seed) => seed + 1);
}

describe('the ticket forecast against the Playbook', () => {
  test(`starts with the step the Playbook takes or the step under way, across ${SEEDS} seeds`, () => {
    const runs = seedNumbers().map((seed) => ({ seed, run: agreementRunOf(LifecycleWorld, seed) }));
    expect(runs.filter(({ run }) => run.disagreements.length > 0).map(({ seed, run }) => ({ seed, first: run.disagreements[0] }))).toEqual([]);
    const checkedKinds = new Set(runs.flatMap(({ run }) => [...run.checkedKinds]));
    expect([...checkedKinds].sort()).toEqual(['build', 'launch-build', 'launch-review', 'merge', 'review']);
  });

  test.each([
    [
      'a build attempt of its own',
      'src/domain/tracker-model/TicketForecasts.ts',
      '{ kind: \'build\', attempt: launchNumbers.buildAttempt, jobId: null }',
      '{ kind: \'build\', attempt: launchNumbers.buildAttempt + 1, jobId: null }',
    ],
    [
      'a review round of its own',
      'src/domain/tracker-model/TicketForecasts.ts',
      'reviewStepsOf(launchNumbers.reviewRound)',
      'reviewStepsOf(FIRST_REVIEW_ROUND)',
    ],
    [
      'no live job',
      'src/domain/tracker-model/TicketForecasts.ts',
      'job.ticketIds.includes(ticketId));',
      'job.ticketIds.includes(ticketId) && job.kind === \'pipeline-agent\');',
    ],
    [
      'a Playbook that counts review rounds another way',
      'src/domain/tracker-model/Playbook.ts',
      'round: nextReviewRoundOf(ticket.id, facts)',
      'round: 1',
    ],
  ])('a forecast drifts once it reads %s', async (_drift, modulePath, find, replace) => {
    const mutated = await mutatedModuleOf(WORLD_MODULE, { modulePath, find, replace });
    const World   = mutated['LifecycleWorld'] as typeof LifecycleWorld;
    expect(seedNumbers().some((seed) => agreementRunOf(World, seed).disagreements.length > 0)).toBe(true);
  });
});
