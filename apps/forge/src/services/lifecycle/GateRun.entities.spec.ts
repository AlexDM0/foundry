/**
 * A gate run of entities on a pipeline with entities. What matters: each gated entity runs its own prepare steps and its own gates of the
 * phase, in the phase's order, and a key the pipeline has no entity for runs nothing; a step's folder reads from the entity's first home
 * folder, a step with no `in` runs there and a leading `/` is the checkout's root; the parts run in turn and the first that does not pass
 * ends the run, named by its entity, with every gate run and cache report so far. Each part runs its lines in a part folder of its own, so
 * two parts, each counting its steps from the first, never share a step folder.
 */
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { PipelineStepRun }          from '../../domain/tracker-model/@types/Job.ts';
import type { Pipeline, PipelineEntity } from '../../domain/tracker-model/@types/Pipeline.ts';
import {
  GateRun,
  type EntityPipelinesRunRequest,
  type PipelineRunRequest,
  type PipelineVerdict
} from './GateRun.ts';

const LINE_RUN_MILLISECONDS = 1200;

const CHECKOUT = '/example/repository/.example-worktrees/merge-main';

function entityOf(kind: PipelineEntity['kind'], home: string[], gates: PipelineEntity['gates'], phases: PipelineEntity['phases']): PipelineEntity {
  return {
    kind, home, prepare: [{ name: 'install', run: `bun install --cwd ${home[0] ?? '/'}` }], gates, phases
  };
}

const EVERY_PHASE_VERIFIES: PipelineEntity['phases'] = { build: ['verify'], review: ['verify'], merge: ['verify'] };

const ENTITIES_PIPELINE: Pipeline = {
  version:  5,
  prepare:  [],
  gates:    [],
  phases:   { build: [], review: [], merge: [] },
  entities: {
    'repository': entityOf('root', ['/'], [{ name: 'audit', run: 'bun run audit' }], { build: [], review: [], merge: ['audit'] }),
    'shop':       entityOf('app', ['/apps/shop', '/apps/shop-assets'], [
      { name: 'lint', run: 'bun run lint' },
      { name: 'test', run: 'bun test', in: 'src' },
    ], { build: ['lint'], review: ['lint'], merge: ['test', 'lint'] }),
    'design-system': entityOf('package', ['/packages/design-system/'], [{ name: 'verify', run: 'bun run verify', in: '/' }], EVERY_PHASE_VERIFIES),
  },
};

const RUN_FOLDER = '/example/board/merge-gates/0123456789abcdef';

const RUN_REQUEST = {
  directory:      CHECKOUT,
  environment:    {},
  childFolder:    RUN_FOLDER,
  runLine:        () => Promise.reject(new Error('unused')),
  confinedLineOf: () => ({ verdict: 'refused', reason: 'unused' }),
} as unknown as EntityPipelinesRunRequest;

describe('the part each gated entity runs', () => {
  test('is its own prepare steps and its gates of the phase in their run order, its folder its first home', () => {
    expect(GateRun.entityPipelinesOf(ENTITIES_PIPELINE, ['shop', 'design-system'], 'merge')).toEqual([
      {
        entityKey:  'shop',
        prepare:    [{ name: 'install', run: 'bun install --cwd /apps/shop' }],
        gates:      [{ name: 'test', run: 'bun test', in: 'src' }, { name: 'lint', run: 'bun run lint' }],
        homePrefix: 'apps/shop',
      },
      {
        entityKey:  'design-system',
        prepare:    [{ name: 'install', run: 'bun install --cwd /packages/design-system/' }],
        gates:      [{ name: 'verify', run: 'bun run verify', in: '/' }],
        homePrefix: 'packages/design-system',
      },
    ]);
  });

  test('runs from the checkout\'s root for a home at the root, and nothing for a key the pipeline has no entity for', () => {
    expect(GateRun.entityPipelinesOf(ENTITIES_PIPELINE, ['repository', 'unknown', 'toString'], 'merge').map((part) => [part.entityKey, part.homePrefix]))
      .toEqual([['repository', '']]);
  });
});

describe('the folder of an entity\'s step', () => {
  test.each([
    ['no in runs in the entity\'s first home', {}, join(CHECKOUT, 'apps', 'shop')],
    ['a folder is relative to that home', { in: 'src' }, join(CHECKOUT, 'apps', 'shop', 'src')],
    ['a lone / is the checkout\'s root', { in: '/' }, CHECKOUT],
    ['a folder leading with / is relative to the checkout\'s root', { in: '/scripts' }, join(CHECKOUT, 'scripts')],
  ])('%s', (_caseName, step, folder) => {
    expect(GateRun.gateDirectoryOf(CHECKOUT, step, GateRun.homePrefixOf('/apps/shop'))).toBe(folder);
  });
});

describe('a run of entities', () => {
  interface RecordingRunner {
    requests: PipelineRunRequest[];
    run:      (request: PipelineRunRequest) => Promise<PipelineVerdict>;
  }

  function recordingRunner(verdictOf: (request: PipelineRunRequest) => PipelineVerdict): RecordingRunner {
    const requests: PipelineRunRequest[] = [];
    return {
      requests,
      run: (request) => {
        requests.push(request);
        return Promise.resolve(verdictOf(request));
      },
    };
  }

  function passedOf(request: PipelineRunRequest): PipelineVerdict {
    const gatesRun = request.gates.map((gate) => gate.name);
    return {
      outcome:      'passed',
      gatesRun,
      cacheReports: gatesRun.map((gateName) => ({ gateName, cacheReport: null })),
      stepRuns:     gatesRun.map((stepName) => ({
        stepKind: 'gate', stepName, runMilliseconds: LINE_RUN_MILLISECONDS, ending: 'passed'
      })),
    };
  }

  function gateRunOf(entity: string, stepName: string, ending: PipelineStepRun['ending'] = 'passed'): PipelineStepRun {
    return {
      stepKind: 'gate', stepName, runMilliseconds: LINE_RUN_MILLISECONDS, ending, entity
    };
  }

  const PARTS = GateRun.entityPipelinesOf(ENTITIES_PIPELINE, ['shop', 'design-system'], 'merge');

  test('runs each part in turn as a single run from its home, and passes with every part\'s gates, cache reports and step runs', async () => {
    const runner = recordingRunner(passedOf);

    const verdict = await GateRun.runEntityPipelines(RUN_REQUEST, PARTS, runner.run);

    expect(runner.requests.map((request) => [request.projectPrefix, request.prepare.map((step) => step.name), request.gates.map((gate) => gate.name)])).toEqual([
      ['apps/shop', ['install'], ['test', 'lint']],
      ['packages/design-system', ['install'], ['verify']],
    ]);
    expect(runner.requests.every((request) => request.directory === CHECKOUT)).toBe(true);
    expect(runner.requests.map((request) => GateRun.stepFolderOf(request.childFolder, 'gate', 0))).toEqual([
      join(RUN_FOLDER, 'part-1', 'gate-1'), join(RUN_FOLDER, 'part-2', 'gate-1'),
    ]);
    expect(verdict).toEqual({
      outcome:      'passed',
      gatesRun:     ['test', 'lint', 'verify'],
      cacheReports: [{ gateName: 'test', cacheReport: null }, { gateName: 'lint', cacheReport: null }, { gateName: 'verify', cacheReport: null }],
      stepRuns:     [gateRunOf('shop', 'test'), gateRunOf('shop', 'lint'), gateRunOf('design-system', 'verify')],
    });
  });

  test('ends at the first part that does not pass, naming its entity, with the gates run so far', async () => {
    const runner = recordingRunner((request) => (request.projectPrefix === 'apps/shop'
      ? {
        outcome:      'failed',
        gate:         'test',
        output:       'expected 2, received 3',
        gatesRun:     ['test'],
        cacheReports: [{ gateName: 'test', cacheReport: null }],
        stepRuns:     [{
          stepKind: 'gate', stepName: 'test', runMilliseconds: LINE_RUN_MILLISECONDS, ending: 'failed'
        }],
      }
      : passedOf(request)));

    const verdict = await GateRun.runEntityPipelines(RUN_REQUEST, PARTS, runner.run);

    expect(runner.requests).toHaveLength(1);
    expect(verdict).toEqual({
      outcome:      'failed',
      gate:         'test',
      output:       'expected 2, received 3',
      gatesRun:     ['test'],
      cacheReports: [{ gateName: 'test', cacheReport: null }],
      stepRuns:     [gateRunOf('shop', 'test', 'failed')],
      entity:       'shop',
    });
  });

  test('names the entity of a prepare step that failed after an earlier part passed', async () => {
    const runner = recordingRunner((request) => (request.projectPrefix === 'packages/design-system'
      ? {
        outcome: 'setup-failed', step: 'install', output: 'no lockfile', gatesRun: [], cacheReports: [], stepRuns: []
      }
      : passedOf(request)));

    const verdict = await GateRun.runEntityPipelines(RUN_REQUEST, PARTS, runner.run);

    expect(verdict).toMatchObject({
      outcome: 'setup-failed', step: 'install', entity: 'design-system', gatesRun: ['test', 'lint']
    });
  });

  test('passes at once with no part to run', async () => {
    const runner = recordingRunner(passedOf);

    expect(await GateRun.runEntityPipelines(RUN_REQUEST, [], runner.run)).toEqual({
      outcome: 'passed', gatesRun: [], cacheReports: [], stepRuns: []
    });
    expect(runner.requests).toEqual([]);
  });
});
