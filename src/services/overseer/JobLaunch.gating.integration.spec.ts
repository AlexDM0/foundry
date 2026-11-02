/**
 * Which gate step a gating job waits on, read outside the lock. What matters: a review that left the tree it was given (the tree the build's
 * gates passed) runs no gate at all; and a review that changed the tree, and any build, waits on the pipeline's first step. Each prepare
 * step runs as a process of its own, never as one joined line: the install and the gate run wait on each step's own Watcher in turn.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterEach, expect }   from 'bun:test';
import type { Job }            from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }       from '../../lib/tracker-model/@types/Pipeline.ts';
import { watcherFilesOf }      from '../../lib/watcher/WatcherFiles.ts';
import { PRODUCT_NAMES }       from '../../shared/constants/ProductNames.ts';
import { nativePlatformPorts } from '../../testing/NativePlatformPorts.ts';
import {
  commitFile,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory
} from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsPresent }             from '../../testing/ToolGuard.ts';
import { JobLaunch, type JobLaunchContext } from './JobLaunch.ts';
import { WatcherFleet }                     from './WatcherFleet.ts';

const PIPELINE: Pipeline = { prepare: [], gates: [{ name: 'tests', run: 'true' }, { name: 'lint', run: 'true' }] };

const repositories: string[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) removeScratchDirectory(repository);
});

interface GatingScene {
  context:  JobLaunchContext;
  worktree: string;
  jobOf:    (kind: 'build' | 'review') => Job;
}

/** A ticket worktree whose job started on its current HEAD, as `recordJobStart` writes it. */
function gatingScene(): GatingScene {
  const repository = createScratchGitRepository('job-gating');
  repositories.push(repository);
  const worktree = join(repository, PRODUCT_NAMES.WORKTREES_FOLDER, 'ticket-001');
  gitOutputIn(repository, ['worktree', 'add', '-q', '-b', 'ticket-001', worktree]);
  const trackerDirectory = join(repository, '.example-tracker');
  const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, 'J2');
  mkdirSync(jobFolder, { recursive: true });
  writeFileSync(join(jobFolder, 'start.json'), JSON.stringify({ startCommit: gitOutputIn(worktree, ['rev-parse', 'HEAD']) }));
  const platformPorts = nativePlatformPorts();
  const context = { platformPorts, workspace: { rootDirectory: repository, trackerDirectory }, agentAdapter: { eventsOf: () => [] } } as unknown as JobLaunchContext;
  const jobOf = (kind: 'build' | 'review'): Job => ({
    id: 'J2', kind, state: 'gating', ticketIds: ['001'], watcherInstance: 1
  }) as unknown as Job;
  return { context, worktree, jobOf };
}

function gateOf(scene: GatingScene, kind: 'build' | 'review'): unknown {
  return JobLaunch.observeBuildJobs(scene.context, [scene.jobOf(kind)], PIPELINE)[0]?.gate;
}

testWhenGitIsPresent('a review that left the tree it was given runs no gate and is judged passed', () => {
  const scene = gatingScene();

  expect(gateOf(scene, 'review')).toMatchObject({
    verdict: 'judged', outcome: 'passed', step: null, ran: false
  });
});

testWhenGitIsPresent('a review that changed the tree waits on the first gate', () => {
  const scene = gatingScene();
  commitFile(scene.worktree, 'review-fix.ts', 'export const fixed = true;\n');

  expect(gateOf(scene, 'review')).toMatchObject({ verdict: 'running', stepIndex: 0 });
});

testWhenGitIsPresent('a build always waits on the first gate, even on the tree it started from', () => {
  expect(gateOf(gatingScene(), 'build')).toMatchObject({ verdict: 'running', stepIndex: 0 });
});

const TWO_PREPARE_STEPS: Pipeline = { ...PIPELINE, prepare: [{ name: 'install', run: 'bun install' }, { name: 'generate', run: 'bun run generate' }] };

/** The process Watcher of one step folder, ended with the given exit code, as the Watcher records it. */
function endStepWatcher(scene: GatingScene, folderName: string, exitCode: number): void {
  const watcherFolder = join(WatcherFleet.jobFolderOf(scene.context.workspace.trackerDirectory, 'J2'), folderName);
  mkdirSync(watcherFolder, { recursive: true });
  writeFileSync(watcherFilesOf(watcherFolder, 1).watcherRecordPath, `${JSON.stringify({
    protocolVersion: 1, eventLogFormatVersion: 1, watcherInstance: 1, state: 'ended', watcher: null, end: { reason: 'exited', exitCode, signal: null },
  })}\n`);
}

function setupOf(scene: GatingScene): unknown {
  const job = { ...scene.jobOf('build'), state: 'preparing' } as Job;
  return JobLaunch.observeBuildJobs(scene.context, [job], TWO_PREPARE_STEPS)[0]?.setup;
}

testWhenGitIsPresent('each prepare step installs in a Watcher of its own: installed only once every step exited 0', () => {
  const scene = gatingScene();
  expect(setupOf(scene)).toBe('installing');

  endStepWatcher(scene, 'install', 0);
  expect(setupOf(scene)).toBe('installing');

  endStepWatcher(scene, 'install2', 0);
  expect(setupOf(scene)).toBe('installed');
});

testWhenGitIsPresent('a failed first prepare step fails the install without waiting on the second', () => {
  const scene = gatingScene();
  endStepWatcher(scene, 'install', 1);

  expect(setupOf(scene)).toBe('install-failed');
});

testWhenGitIsPresent('a gate run runs each prepare step as a step of its own before the first gate', () => {
  const scene = gatingScene();
  const gateWith = (): unknown => JobLaunch.observeBuildJobs(scene.context, [scene.jobOf('build')], TWO_PREPARE_STEPS)[0]?.gate;
  expect(gateWith()).toMatchObject({ verdict: 'running', stepIndex: 0 });

  endStepWatcher(scene, 'gate-prepare', 0);
  expect(gateWith()).toMatchObject({ verdict: 'running', stepIndex: 1 });

  endStepWatcher(scene, 'gate-prepare2', 0);
  expect(gateWith()).toMatchObject({ verdict: 'running', stepIndex: 2 });
});
