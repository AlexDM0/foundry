/**
 * Which gate step a gating job waits on, read outside the lock. What matters: a review that left the tree it was given (the tree the build's
 * gates passed) runs no gate at all, unless its hold marked that green not current; and a review that changed the tree, and any build,
 * waits on the pipeline's first step. A build job runs only the build phase's gates and a review job only the review phase's, and a phase
 * with no gates passes at once without its prepare steps. Each prepare step runs as a process of its own, never as one joined line: the
 * install and the gate run wait on each step's own Watcher in turn. git answers the tree reads from the recordings of
 * `src/testing/RecordedGit.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterEach, expect } from 'bun:test';

import type { Job }            from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }       from '../../lib/tracker-model/@types/Pipeline.ts';
import { watcherFilesOf }      from '../../lib/watcher/WatcherFiles.ts';
import { PRODUCT_NAMES }       from '../../shared/constants/ProductNames.ts';
import { nativePlatformPorts } from '../../testing/NativePlatformPorts.ts';
import {
  GIT_CALL_SHAPES,
  type GitCallShape,
  type RecordedGitStage,
  type RecordedGitStep,
  useRecordedGit
} from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                          from '../../testing/ToolGuard.ts';
import { JobLaunch, type JobLaunchContext }               from './JobLaunch.ts';
import { WatcherFleet }                                   from './WatcherFleet.ts';

const PIPELINE: Pipeline = {
  version: 2,
  prepare: [],
  gates:   [{ name: 'tests', run: 'true' }, { name: 'lint', run: 'true' }],
  phases:  { build: ['tests', 'lint'], review: ['tests', 'lint'], merge: ['tests', 'lint'] },
};
const START_COMMIT = 'example-start-commit';

const recordedGit = useRecordedGit();
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

function treeOf(revision: string, answeredAs: GitCallShape): RecordedGitStep {
  return { gitArguments: ['rev-parse', '--verify', '--quiet', `${revision}^{tree}`], answeredAs };
}

const HEAD_ON_THE_START_TREE = treeOf('HEAD', GIT_CALL_SHAPES.TREE_OF_AN_EMPTY_COMMIT);
const START_TREE = treeOf(START_COMMIT, GIT_CALL_SHAPES.TREE_OF_AN_EMPTY_COMMIT);

interface GatingScene {
  context: JobLaunchContext;
  jobOf:   (kind: 'build' | 'review') => Job;
}

/** A ticket worktree folder whose job started on `START_COMMIT`, as `recordJobStart` writes it. */
function gatingScene(): GatingScene {
  const rootDirectory = createScratchDirectory('job-gating');
  folders.push(rootDirectory);
  mkdirSync(join(rootDirectory, PRODUCT_NAMES.WORKTREES_FOLDER, 'ticket-001'), { recursive: true });
  const trackerDirectory = join(rootDirectory, '.example-tracker');
  const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, 'J2');
  mkdirSync(jobFolder, { recursive: true });
  writeFileSync(join(jobFolder, 'start.json'), JSON.stringify({ startCommit: START_COMMIT }));
  const platformPorts = nativePlatformPorts();
  const context = { platformPorts, workspace: { rootDirectory, trackerDirectory }, agentAdapter: { eventsOf: () => [] } } as unknown as JobLaunchContext;
  const jobOf = (kind: 'build' | 'review'): Job => ({
    id: 'J2', kind, state: 'gating', ticketIds: ['001'], watcherInstance: 1
  }) as unknown as Job;
  return { context, jobOf };
}

function gateOf(scene: GatingScene, kind: 'build' | 'review', stage: RecordedGitStage, pipeline: Pipeline = PIPELINE): Promise<unknown> {
  return recordedGit.playStage(stage, () => Promise.resolve(JobLaunch.observeBuildJobs(scene.context, [scene.jobOf(kind)], pipeline)[0]?.gate));
}

testWhenGitIsRecorded('a review that left the tree it was given runs no gate and is judged passed', async () => {
  expect(await gateOf(gatingScene(), 'review', [HEAD_ON_THE_START_TREE, START_TREE])).toMatchObject({
    verdict: 'judged', outcome: 'passed', step: null, ran: false
  });
});

testWhenGitIsRecorded('a review that left the tree it was given waits on the first gate once its hold marked the green not current', async () => {
  const scene = gatingScene();
  writeFileSync(join(WatcherFleet.jobFolderOf(scene.context.workspace.trackerDirectory, 'J2'), 'regate-required'), 'example-tree\n');

  expect(await gateOf(scene, 'review', [HEAD_ON_THE_START_TREE])).toMatchObject({ verdict: 'running', stepIndex: 0 });
});

testWhenGitIsRecorded('a review that changed the tree waits on the first gate', async () => {
  const headOnAChangedTree = treeOf('HEAD', GIT_CALL_SHAPES.TREE_OF_A_COMMIT_WITH_A_FILE);

  expect(await gateOf(gatingScene(), 'review', [headOnAChangedTree, START_TREE])).toMatchObject({ verdict: 'running', stepIndex: 0 });
});

testWhenGitIsRecorded('a build always waits on the first gate, even on the tree it started from', async () => {
  expect(await gateOf(gatingScene(), 'build', [HEAD_ON_THE_START_TREE])).toMatchObject({ verdict: 'running', stepIndex: 0 });
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

function setupOf(scene: GatingScene): Promise<unknown> {
  const job = { ...scene.jobOf('build'), state: 'preparing' } as Job;
  return recordedGit.playStage([], () => Promise.resolve(JobLaunch.observeBuildJobs(scene.context, [job], TWO_PREPARE_STEPS)[0]?.setup));
}

testWhenGitIsRecorded('each prepare step installs in a Watcher of its own: installed only once every step exited 0', async () => {
  const scene = gatingScene();
  expect(await setupOf(scene)).toBe('installing');

  endStepWatcher(scene, 'install', 0);
  expect(await setupOf(scene)).toBe('installing');

  endStepWatcher(scene, 'install2', 0);
  expect(await setupOf(scene)).toBe('installed');
});

testWhenGitIsRecorded('a failed first prepare step fails the install without waiting on the second', async () => {
  const scene = gatingScene();
  endStepWatcher(scene, 'install', 1);

  expect(await setupOf(scene)).toBe('install-failed');
});

testWhenGitIsRecorded('a gate run runs each prepare step as a step of its own before the first gate', async () => {
  const scene = gatingScene();
  const gateWith = (): Promise<unknown> => recordedGit.playStage([HEAD_ON_THE_START_TREE], () => Promise.resolve(
    JobLaunch.observeBuildJobs(scene.context, [scene.jobOf('build')], TWO_PREPARE_STEPS)[0]?.gate
  ));
  expect(await gateWith()).toMatchObject({ verdict: 'running', stepIndex: 0 });

  endStepWatcher(scene, 'gate-prepare', 0);
  expect(await gateWith()).toMatchObject({ verdict: 'running', stepIndex: 1 });

  endStepWatcher(scene, 'gate-prepare2', 0);
  expect(await gateWith()).toMatchObject({ verdict: 'running', stepIndex: 2 });
});

/** Each phase runs a gate of its own, none of them first in the gate list, so the gate a job's first gate folder runs names its phase. */
const ONE_GATE_PER_PHASE: Pipeline = {
  version: 2,
  prepare: [{ name: 'install', run: 'bun install' }],
  gates:   [{ name: 'audit', run: 'bun run audit' }, { name: 'tests', run: 'bun test' }, { name: 'lint', run: 'bun run lint' }],
  phases:  { build: ['lint'], review: ['tests'], merge: ['audit'] },
};
const TRACKED_TREE_UNCHANGED: RecordedGitStep = { gitArguments: ['diff', '--no-ext-diff', 'HEAD', '--'], answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE };

testWhenGitIsRecorded('a build job runs only the build phase\'s gates, after the prepare steps', async () => {
  const scene = gatingScene();
  endStepWatcher(scene, 'gate-prepare', 0);
  endStepWatcher(scene, 'gate-1', 1);

  expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED], ONE_GATE_PER_PHASE)).toMatchObject({
    verdict: 'judged', outcome: 'failed', step: 'lint', ran: true
  });
});

testWhenGitIsRecorded('a review job runs only the review phase\'s gates, after the prepare steps', async () => {
  const scene = gatingScene();
  const headOnAChangedTree = treeOf('HEAD', GIT_CALL_SHAPES.TREE_OF_A_COMMIT_WITH_A_FILE);
  endStepWatcher(scene, 'gate-prepare', 0);
  endStepWatcher(scene, 'gate-1', 1);

  expect(await gateOf(scene, 'review', [headOnAChangedTree, START_TREE, TRACKED_TREE_UNCHANGED], ONE_GATE_PER_PHASE)).toMatchObject({
    verdict: 'judged', outcome: 'failed', step: 'tests', ran: true
  });
});

testWhenGitIsRecorded('a phase with no gates passes at once and runs no prepare step, though the pipeline has one', async () => {
  const noBuildGates: Pipeline = { ...ONE_GATE_PER_PHASE, phases: { ...ONE_GATE_PER_PHASE.phases, build: [] } };

  expect(await gateOf(gatingScene(), 'build', [HEAD_ON_THE_START_TREE], noBuildGates)).toMatchObject({
    verdict: 'judged', outcome: 'passed', step: null, ran: true
  });
});
