/**
 * The Overseer's gate run of a merged tree or a stale green. What matters: on a pipeline with entities each gated entity's part runs with
 * its first home folder as the project folder, every entity's part runs when the Airlocks name none, the stamp holds the phase hash of each
 * entity that ran and of no other, and a red part names its entity; a pipeline without entities keeps the one run from the tracker's
 * project folder and the stamp without entity hashes, and no stored pipeline runs no step and stamps nothing. Each entity's part runs its
 * lines in its own part folder of the run folder; a pipeline without entities runs them in the run folder itself. The step lines that ran
 * go with the run's phase, each named by its entity on a pipeline with entities.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineStepRun }                                                from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline, PipelineEntity }                                       from '../../lib/tracker-model/@types/Pipeline.ts';
import { PipelineUtil }                                                        from '../../lib/tracker-model/utils/PipelineUtil.ts';
import type { EntityPipelinesRunRequest, PipelineRunRequest, PipelineVerdict } from '../lifecycle/GateRun.ts';
import { type MergedTreeGateRunRequest, runMergedTreeGates }                   from './MergedTreeGateRun.ts';

const PROJECT_PREFIX = 'apps/example';

const LINE_RUN_MILLISECONDS = 1500;

function entityOf(home: string[], gateName: string): PipelineEntity {
  return {
    kind:    'app',
    home,
    prepare: [{ name: `install-${gateName}`, run: 'bun install' }],
    gates:   [{ name: gateName, run: `bun run ${gateName}` }],
    phases:  { build: [gateName], review: [gateName], merge: [gateName] },
  };
}

const ENTITIES_PIPELINE: Pipeline = {
  version:  5,
  prepare:  [],
  gates:    [],
  phases:   { build: [], review: [], merge: [] },
  entities: {
    shop:   entityOf(['/apps/shop', '/apps/shop-assets'], 'verify-shop'),
    tokens: entityOf(['/packages/tokens/'], 'verify-tokens'),
    admin:  entityOf(['/apps/admin'], 'verify-admin'),
  },
};

const SINGLE_PIPELINE: Pipeline = {
  version: 5,
  prepare: [{ name: 'install', run: 'bun install' }],
  gates:   [{ name: 'verify', run: 'bun run verify' }],
  phases:  { build: ['verify'], review: ['verify'], merge: ['verify'] },
};

const RUN_FOLDER = '/example/board/merge-gates/0123456789abcdef';

const RUN_REQUEST = {
  directory:      '/example/repository/.example-worktrees/merge-main',
  environment:    {},
  childFolder:    RUN_FOLDER,
  runLine:        () => Promise.reject(new Error('unused')),
  confinedLineOf: () => ({ verdict: 'refused', reason: 'unused' }),
} as unknown as EntityPipelinesRunRequest;

interface RecordedRun {
  childFolder:   string;
  projectPrefix: string | undefined;
  prepare:       string[];
  gates:         string[];
}

/** Records each single run it is handed, and fails the gate `redGate` names. */
function recordingRunner(redGate: string | null = null): { runs: RecordedRun[]; runOnePipeline: (pipelineRequest: PipelineRunRequest) => Promise<PipelineVerdict> } {
  const runs: RecordedRun[] = [];
  return {
    runs,
    runOnePipeline: (pipelineRequest) => {
      const gateNames = pipelineRequest.gates.map((gate) => gate.name);
      runs.push({
        childFolder: pipelineRequest.childFolder, projectPrefix: pipelineRequest.projectPrefix, prepare: pipelineRequest.prepare.map((step) => step.name), gates: gateNames
      });
      const stepRuns = gateNames.map((stepName): PipelineStepRun => ({
        stepKind: 'gate', stepName, runMilliseconds: LINE_RUN_MILLISECONDS, ending: stepName === redGate ? 'failed' : 'passed'
      }));
      if (redGate !== null && gateNames.includes(redGate)) return Promise.resolve({
        outcome: 'failed', gate: redGate, output: 'expected 2, received 3', gatesRun: gateNames, cacheReports: [], stepRuns
      });
      return Promise.resolve({
        outcome: 'passed', gatesRun: gateNames, cacheReports: [], stepRuns
      });
    },
  };
}

function requestOf(
  pipeline: Readonly<Pipeline> | null, gatedEntities: MergedTreeGateRunRequest['gatedEntities'], runOnePipeline: MergedTreeGateRunRequest['runOnePipeline']
): MergedTreeGateRunRequest {
  return {
    pipeline, phase: 'merge', gatedEntities, runRequest: RUN_REQUEST, projectPrefix: PROJECT_PREFIX, runOnePipeline
  };
}

describe('a merged tree\'s gate run on a pipeline with entities', () => {
  test('runs each gated entity\'s part from its first home folder, and stamps the phase hash of those entities and no other', async () => {
    const runner = recordingRunner();

    const gate = await runMergedTreeGates(requestOf(ENTITIES_PIPELINE, ['shop', 'tokens'], runner.runOnePipeline));

    expect(runner.runs).toEqual([
      {
        childFolder: `${RUN_FOLDER}/part-1`, projectPrefix: 'apps/shop', prepare: ['install-verify-shop'], gates: ['verify-shop']
      },
      {
        childFolder: `${RUN_FOLDER}/part-2`, projectPrefix: 'packages/tokens', prepare: ['install-verify-tokens'], gates: ['verify-tokens']
      },
    ]);
    expect(gate.outcome).toBe('passed');
    expect(gate.stamp).toEqual(PipelineUtil.entitiesGateRunStampOf(ENTITIES_PIPELINE, 'merge', ['shop', 'tokens']));
    expect(Object.keys(gate.stamp?.entityPhaseHashes ?? {})).toEqual(['shop', 'tokens']);
    expect(gate.stepRuns).toEqual({
      phase: 'merge',
      steps: [
        {
          stepKind: 'gate', stepName: 'verify-shop', runMilliseconds: LINE_RUN_MILLISECONDS, ending: 'passed', entity: 'shop'
        },
        {
          stepKind: 'gate', stepName: 'verify-tokens', runMilliseconds: LINE_RUN_MILLISECONDS, ending: 'passed', entity: 'tokens'
        },
      ],
    });
  });

  test('runs every entity\'s part when the Airlocks name no gated entities', async () => {
    const runner = recordingRunner();

    const gate = await runMergedTreeGates(requestOf(ENTITIES_PIPELINE, undefined, runner.runOnePipeline));

    expect(runner.runs.map((run) => run.projectPrefix)).toEqual(['apps/shop', 'packages/tokens', 'apps/admin']);
    expect(Object.keys(gate.stamp?.entityPhaseHashes ?? {})).toEqual(['shop', 'tokens', 'admin']);
  });

  test('names the entity of the red gate, whose part ends the run', async () => {
    const runner = recordingRunner('verify-tokens');

    const gate = await runMergedTreeGates(requestOf(ENTITIES_PIPELINE, undefined, runner.runOnePipeline));

    expect(runner.runs).toHaveLength(2);
    expect(gate).toMatchObject({ outcome: 'failed', step: 'verify-tokens', entity: 'tokens' });
  });
});

describe('a merged tree\'s gate run on a pipeline without entities', () => {
  test('is one run of the forge\'s own steps from the tracker\'s project folder, stamped without entity hashes', async () => {
    const runner = recordingRunner();

    const gate = await runMergedTreeGates(requestOf(SINGLE_PIPELINE, ['shop'], runner.runOnePipeline));

    expect(runner.runs).toEqual([{
      childFolder: RUN_FOLDER, projectPrefix: PROJECT_PREFIX, prepare: ['install'], gates: ['verify']
    }]);
    expect(gate).toEqual({
      outcome:  'passed',
      step:     null,
      output:   '',
      stamp:    PipelineUtil.gateRunStampOf(SINGLE_PIPELINE, 'merge'),
      stepRuns: {
        phase: 'merge',
        steps: [{
          stepKind: 'gate', stepName: 'verify', runMilliseconds: LINE_RUN_MILLISECONDS, ending: 'passed'
        }],
      },
    });
    expect(gate).not.toHaveProperty('entity');
  });

  test('runs no step and stamps nothing when no pipeline is stored', async () => {
    const runner = recordingRunner();

    const gate = await runMergedTreeGates(requestOf(null, undefined, runner.runOnePipeline));

    expect(runner.runs).toEqual([{
      childFolder: RUN_FOLDER, projectPrefix: PROJECT_PREFIX, prepare: [], gates: []
    }]);
    expect(gate.stamp).toBeNull();
    expect(gate).not.toHaveProperty('stepRuns');
  });
});
