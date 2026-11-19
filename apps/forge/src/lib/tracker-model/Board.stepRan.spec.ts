/**
 * A pipeline step line's run in the log. What matters: each step line of a run is one `pipeline-step-ran` record in run order, with the
 * run's phase and the step's entity only where they exist, so an install step on a forge without entities stores neither. The log's check,
 * the read back and the printed line are the log adapters' specs.
 */
import { expect, test } from 'bun:test';

import { boardFixture }         from '../../testing/BoardFixtures.ts';
import type { PipelineStepRun } from './@types/Job.ts';

const AT = '2026-11-19T09:00:00+01:00';

const INSTALL_STEP_RUNS: PipelineStepRun[] = [
  {
    stepKind: 'prepare', stepName: 'install', runMilliseconds: 61_000, ending: 'passed'
  },
  {
    stepKind: 'prepare', stepName: 'codegen', runMilliseconds: 900_000, ending: 'time-bound'
  },
];

const ENTITY_GATE_RUN: PipelineStepRun = {
  stepKind: 'gate', stepName: 'verify', entity: 'web', runMilliseconds: 4200, ending: 'failed'
};

test('an install\'s step lines are one record each, in run order, with no phase and no entity', () => {
  const { board, records } = boardFixture();

  const { logged } = board.recordPipelineStepsRan(INSTALL_STEP_RUNS, null, AT);

  expect(logged).toEqual(records);
  expect(records.map((record) => record.fields)).toEqual([
    {
      stepKind: 'prepare', stepName: 'install', runMilliseconds: 61_000, ending: 'passed'
    },
    {
      stepKind: 'prepare', stepName: 'codegen', runMilliseconds: 900_000, ending: 'time-bound'
    },
  ]);
});

test('a gate run\'s step of an entity carries the run\'s phase and the entity, and a run that ran no line records none', () => {
  const { board, records } = boardFixture();

  board.recordPipelineStepsRan([], 'merge', AT);
  board.recordPipelineStepsRan([ENTITY_GATE_RUN], 'merge', AT);

  expect(records.map((record) => record.fields)).toEqual([{
    stepKind: 'gate', stepName: 'verify', phase: 'merge', entity: 'web', runMilliseconds: 4200, ending: 'failed'
  }]);
});
