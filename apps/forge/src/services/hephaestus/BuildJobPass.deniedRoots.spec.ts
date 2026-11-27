/**
 * The denied roots a launch makes in its worktree under `mount-points`, the Linux deny shape. What matters: a worktree with no `.claude`
 * folder gets one before the launch, so the folder gets its read-only mount; a folder that cannot be made records a refusal and the launch
 * does not start; and the hold turns that refusal into `sandbox-unavailable` also for a worker launch, which stands in `running`. On a
 * forge with entities a prepare step's sandbox, like a session's, makes and denies the `.claude` folder of every entity home (E7).
 */
import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { join }                               from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { SandboxRefusalIngestion }                        from '../../adapters/sandbox-refusal/SandboxRefusalIngestion.ts';
import type { Job }                                       from '../../domain/tracker-model/@types/Job.ts';
import type { Pipeline }                                  from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                                     from '../../domain/tracker-model/Board.ts';
import type { SandboxDenyShape }                          from '../../lib/agent-launch/WorkerProfile.ts';
import { boardFixture, ticketFixture }                    from '../../testing/BoardFixtures.ts';
import { fakeAgentAdapter }                               from '../../testing/FakeAgentAdapter.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                         from '../../testing/TalosChildReadings.ts';
import type { BoardTransaction }                          from '../tracker/BoardTransaction.ts';
import type { BuildJobObservation }                       from './@types/BuildJobObservation.ts';
import type { JobLaunchContext }                          from './@types/JobLaunchContext.ts';
import { BuildJobPass }                                   from './BuildJobPass.ts';
import { jobFolderIn }                                    from './HephaestusFiles.ts';
import { JobPreparation }                                 from './JobPreparation.ts';
import { JobSandbox }                                     from './JobSandbox.ts';
import { WorktreeJobs }                                   from './WorktreeJobs.ts';

const AT = '2026-11-03T10:00:00+01:00';

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

interface RunningScene {
  board:    Board;
  job:      Readonly<Job>;
  context:  JobLaunchContext;
  worktree: string;
}

/** A build job past its setup, its worker about to launch in its existing worktree. */
function runningScene(sandboxDenyShape: SandboxDenyShape): RunningScene {
  const rootDirectory = createScratchDirectory('denied-roots');
  folders.push(rootDirectory);
  const trackerDirectory = join(rootDirectory, '.example-tracker');
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 })] });
  const { job } = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  for (const state of ['preparing', 'running'] as const) board.moveJob(job.id, state, AT);
  const context = {
    platformPorts: nativePlatformPorts(),
    boardChildren: talosChildReadingsWith(nativePlatformPorts(), trackerDirectory),
    workspace:     { rootDirectory, trackerDirectory },
    agentAdapter:  { ...fakeAgentAdapter(), sandboxDenyShape },
    log:           () => undefined,
  } as unknown as JobLaunchContext;
  const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
  mkdirSync(worktree, { recursive: true });
  return {
    board, job, context, worktree
  };
}

function observationOf(context: JobLaunchContext, job: Readonly<Job>): BuildJobObservation {
  const refusalPath = join(jobFolderIn(context.workspace.trackerDirectory, job.id), 'sandbox-refusal.json');
  const stored = new SandboxRefusalIngestion(refusalPath).read();
  const sandboxRefusal = stored.verdict === 'readable' ? stored.refusal : null;
  return {
    jobId:            job.id,
    setup:            'installed',
    installStepRuns:  [],
    calls:            0,
    report:           undefined,
    agentEnd:         null,
    gate:             { verdict: 'pending' },
    sandboxRefusal,
    targetCatchUp:    { verdict: 'not-checked' },
    mainMerge:        null,
    conflictReReview: null
  };
}

describe('the denied roots a launch makes', () => {
  test('under mount-points a worktree with no .claude folder gets one, and the launch goes on', () => {
    const scene = runningScene('mount-points');
    expect(JobSandbox.deniedRootRefusalRecorded(scene.context, scene.job, 'worker')).toBe(false);
    expect(existsSync(join(scene.worktree, '.claude'))).toBe(true);
    expect(observationOf(scene.context, scene.job).sandboxRefusal).toBeNull();
  });

  test('under path-rules nothing is made, since a rule denies an absent path', () => {
    const scene = runningScene('path-rules');
    expect(JobSandbox.deniedRootRefusalRecorded(scene.context, scene.job, 'worker')).toBe(false);
    expect(existsSync(join(scene.worktree, '.claude'))).toBe(false);
  });

  test('a .claude folder that cannot be made refuses the worker launch, and the hold opens sandbox-unavailable and ends the job', () => {
    const scene = runningScene('mount-points');
    symlinkSync(join(scene.worktree, 'example-missing', 'target'), join(scene.worktree, '.claude'));
    expect(JobSandbox.deniedRootRefusalRecorded(scene.context, scene.job, 'worker')).toBe(true);
    const observation = observationOf(scene.context, scene.job);
    const refusal = { step: 'worker', reason: `the denied folder ${join(scene.worktree, '.claude')} could not be made, so it would get no read-only mount` };
    expect(observation.sandboxRefusal).toEqual(refusal);
    expect(BuildJobPass.someBuildJobAwaitsAPass(scene.board, [observation])).toBe(true);
    BuildJobPass.applyBuildJobObservations({ board: scene.board, at: AT } as unknown as BoardTransaction, scene.context, [observation]);
    expect(scene.board.incidents().map((incident) => [incident.kind, incident.facts])).toEqual([['sandbox-unavailable', refusal]]);
    expect(scene.board.jobById(scene.job.id)).toBeUndefined();
  });
});

const NO_PHASES = { build: [], review: [], merge: [] };

const PIPELINE_WITH_ENTITIES: Pipeline = {
  version:  5,
  prepare:  [{ name: 'install', run: 'bun install' }],
  gates:    [],
  phases:   NO_PHASES,
  entities: {
    gaia: {
      kind: 'app', home: ['/apps/gaia'], prepare: [], gates: [], phases: NO_PHASES
    },
  },
};

describe('the denied roots a prepare step makes on a forge with entities', () => {
  test('include the .claude folder of every entity home, and one that cannot be made refuses the step before it starts', async () => {
    const scene = runningScene('mount-points');
    const entityClaudeFolder = join(scene.worktree, 'apps', 'gaia', '.claude');
    mkdirSync(join(scene.worktree, 'apps', 'gaia'), { recursive: true });
    symlinkSync(join(scene.worktree, 'example-missing', 'target'), entityClaudeFolder);
    await JobPreparation.spawnNextInstallStep(scene.context, scene.job, PIPELINE_WITH_ENTITIES);
    expect(existsSync(join(scene.worktree, '.claude'))).toBe(true);
    const reason = `the denied folder ${entityClaudeFolder} could not be made, so it would get no read-only mount`;
    expect(observationOf(scene.context, scene.job).sandboxRefusal).toEqual({ step: 'install', reason });
  });
});
