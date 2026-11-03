/**
 * The denied roots a launch makes in its worktree under `mount-points`, the Linux deny shape. What matters: a worktree with no `.claude`
 * folder gets one before the launch, so the folder gets its read-only mount; a folder that cannot be made records a refusal and the launch
 * does not start; and the hold turns that refusal into `sandbox-unavailable` also for a worker launch, which stands in `running`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { SandboxDenyShape }                                      from '../../lib/agent-launch/WorkerProfile.ts';
import type { Job }                                                   from '../../lib/tracker-model/@types/Job.ts';
import type { Board }                                                 from '../../lib/tracker-model/Board.ts';
import { boardFixture, ticketFixture }                                from '../../testing/BoardFixtures.ts';
import { createScratchDirectory, removeScratchDirectory }             from '../../testing/ScratchWorkspace.ts';
import type { TrackerChange }                                         from '../tracker/TrackerPipeline.ts';
import { type BuildJobObservation, JobLaunch, type JobLaunchContext } from './JobLaunch.ts';
import { WatcherFleet }                                               from './WatcherFleet.ts';

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
    workspace:    { rootDirectory, trackerDirectory },
    agentAdapter: { sandboxDenyShape },
    log:          () => undefined,
  } as unknown as JobLaunchContext;
  const worktree = JobLaunch.worktreeOf(context.workspace, job);
  mkdirSync(worktree, { recursive: true });
  return {
    board, job, context, worktree
  };
}

function observationOf(context: JobLaunchContext, job: Readonly<Job>): BuildJobObservation {
  const refusalPath = join(WatcherFleet.jobFolderOf(context.workspace.trackerDirectory, job.id), 'sandbox-refusal.json');
  const sandboxRefusal = existsSync(refusalPath) ? JSON.parse(readFileSync(refusalPath, 'utf8')) as BuildJobObservation['sandboxRefusal'] : null;
  return {
    jobId: job.id, setup: 'installed', calls: 0, report: undefined, agentEnd: null, gate: { verdict: 'pending' }, sandboxRefusal
  };
}

describe('the denied roots a launch makes', () => {
  test('under mount-points a worktree with no .claude folder gets one, and the launch goes on', () => {
    const scene = runningScene('mount-points');
    expect(JobLaunch.deniedRootRefusalRecorded(scene.context, scene.job, 'worker')).toBe(false);
    expect(existsSync(join(scene.worktree, '.claude'))).toBe(true);
    expect(observationOf(scene.context, scene.job).sandboxRefusal).toBeNull();
  });

  test('under path-rules nothing is made, since a rule denies an absent path', () => {
    const scene = runningScene('path-rules');
    expect(JobLaunch.deniedRootRefusalRecorded(scene.context, scene.job, 'worker')).toBe(false);
    expect(existsSync(join(scene.worktree, '.claude'))).toBe(false);
  });

  test('a .claude folder that cannot be made refuses the worker launch, and the hold opens sandbox-unavailable and ends the job', () => {
    const scene = runningScene('mount-points');
    symlinkSync(join(scene.worktree, 'example-missing', 'target'), join(scene.worktree, '.claude'));
    expect(JobLaunch.deniedRootRefusalRecorded(scene.context, scene.job, 'worker')).toBe(true);
    const observation = observationOf(scene.context, scene.job);
    const refusal = { step: 'worker', reason: `the denied folder ${join(scene.worktree, '.claude')} could not be made, so it would get no read-only mount` };
    expect(observation.sandboxRefusal).toEqual(refusal);
    expect(JobLaunch.someBuildJobAwaitsAPass(scene.board, [observation])).toBe(true);
    JobLaunch.applyBuildJobObservations({ board: scene.board, at: AT } as unknown as TrackerChange, scene.context, [observation]);
    expect(scene.board.incidents().map((incident) => [incident.kind, incident.facts])).toEqual([['sandbox-unavailable', refusal]]);
    expect(scene.board.jobById(scene.job.id)).toBeUndefined();
  });
});
