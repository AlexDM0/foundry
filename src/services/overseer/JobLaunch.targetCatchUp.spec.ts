/**
 * A review job brings its branch up to the target's tip before its reviewer starts. What matters: a branch that holds the tip starts its
 * reviewer with no merge and no gate; one that lacks it gets the target merged in by a process Watcher with every hook off, and its
 * reviewer starts only once the gates are green on the merged tree; a red gate and a conflict both send the work back to the builder,
 * counted in its handoff cycle, and a conflict leaves the worktree clean at the branch tip. Real git in a scratch repository, since the
 * fake git has no `merge --abort` or `reset`; the launcher is fake, and the spec runs the Watcher's command itself.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import { afterEach, expect } from 'bun:test';

import type { Job }                    from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }              from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline }               from '../../lib/tracker-model/@types/Pipeline.ts';
import { Board }                       from '../../lib/tracker-model/Board.ts';
import { createLogger }                from '../../lib/tracker-model/Logger.ts';
import { Playbook }                    from '../../lib/tracker-model/Playbook.ts';
import { watcherFilesOf }              from '../../lib/watcher/WatcherFiles.ts';
import { PRODUCT_NAMES }               from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import { nativePlatformPorts }         from '../../testing/NativePlatformPorts.ts';
import {
  commitFile,
  createScratchDirectory,
  createScratchGitRepository,
  currentBranchOf,
  gitOutputIn,
  removeScratchDirectory,
  SCRATCH_COMMIT_IDENTITY_ARGUMENTS
} from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsPresent }                               from '../../testing/ToolGuard.ts';
import type { TrackerChange }                                 from '../tracker/TrackerPipeline.ts';
import type { GateRunSlots }                                  from './GateRunSlots.ts';
import { BUILD_JOB_CAUSES, JobLaunch, type JobLaunchContext } from './JobLaunch.ts';
import type { ProcessStarts }                                 from './ProcessStarts.ts';
import { RedHandoff }                                         from './RedHandoff.ts';
import { WatcherFleet }                                       from './WatcherFleet.ts';

const AT = '2026-11-02T10:00:00+01:00';
const PIPELINE: Pipeline = { prepare: [], gates: [{ name: 'tests', run: 'bun test' }], review: { name: 'Review' } };
const TRACKER_ID = 'example-tracker-id';

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

interface CatchUpScene {
  board:          Board;
  context:        JobLaunchContext;
  repository:     string;
  worktree:       string;
  reviewJobId:    string;
  spawnedFolders: string[];
  pass:           () => Promise<void>;
  reviewJob:      () => Readonly<Job> | undefined;
  jobFolder:      () => string;
}

/** The builder of #001 built on `ticket-001`, ended `built`, and its review job stands installed in `preparing`, its reviewer not started. */
function catchUpScene(): CatchUpScene {
  const repository = createScratchGitRepository('catch-up');
  const monitorFolder = createScratchDirectory('m');
  folders.push(repository, monitorFolder);
  commitFile(repository, 'shared.txt', 'first line\n');
  const target = currentBranchOf(repository);
  const worktree = join(repository, PRODUCT_NAMES.WORKTREES_FOLDER, 'ticket-001');
  gitOutputIn(repository, ['worktree', 'add', '-q', '-b', 'ticket-001', worktree]);
  commitFile(worktree, 'feature.txt', 'the feature\n');
  const trackerDirectory = join(repository, '.example-tracker');
  const { progress, tickets } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-review', task: 1 })] });
  const logRecords: LogRecord[] = [];
  const board = new Board({
    progress, tickets, epics: [], logger: createLogger((record) => logRecords.push(record)), pipeline: PIPELINE
  });
  const build = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target
  }, AT);
  for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(build.job.id, state, AT);
  board.endJob(build.job.id, { outcome: 'built' }, AT);
  const review = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target
  }, AT);
  board.startReviewBar('001', { round: 1, owner: review.job.id }, AT);
  board.moveJob(review.job.id, 'preparing', AT);
  const spawnedFolders: string[] = [];
  const processStarts = { spawnWatcher: (_ports: unknown, request: { jobFolder: string }) => spawnedFolders.push(request.jobFolder) } as unknown as ProcessStarts;
  const gateSlots = { tryAcquire: () => false, release: () => undefined, recordSpawnedProcess: () => undefined } as unknown as GateRunSlots;
  const context = {
    platformPorts:        nativePlatformPorts(),
    workspace:            { rootDirectory: repository, trackerDirectory },
    agentAdapter:         { eventsOf: () => [] },
    monitorFolder,
    homeDirectory:        monitorFolder,
    inheritedEnvironment: {},
    mainLine:             target,
    groupTargetPrefix:    'group-',
    watcherBundlePath:    join(monitorFolder, 'watcher.js'),
    codeVersion:          'example-version',
    gateSlots,
    log:                  () => undefined,
    processStarts,
  } as unknown as JobLaunchContext;
  const change = { board, at: AT } as unknown as TrackerChange;
  const pass = async (): Promise<void> => {
    const observations = JobLaunch.observeBuildJobs(context, board.jobs(), board.pipeline());
    JobLaunch.applyBuildJobObservations(change, context, observations);
    await JobLaunch.runBuildJobEffects(context, board, TRACKER_ID, observations);
  };
  return {
    board,
    context,
    repository,
    worktree,
    reviewJobId: review.job.id,
    spawnedFolders,
    pass,
    reviewJob:   () => board.jobs().find((job) => job.id === review.job.id),
    jobFolder:   () => WatcherFleet.jobFolderOf(trackerDirectory, review.job.id),
  };
}

/** The process Watcher of one folder, ended with the given exit code, as the Watcher records it. */
function endWatcher(watcherFolder: string, exitCode: number): void {
  mkdirSync(watcherFolder, { recursive: true });
  writeFileSync(watcherFilesOf(watcherFolder, 1).watcherRecordPath, `${JSON.stringify({
    protocolVersion: 1, eventLogFormatVersion: 1, watcherInstance: 1, state: 'ended', watcher: null, end: { reason: 'exited', exitCode, signal: null },
  })}\n`);
}

/** Runs the merge Watcher's command as the Watcher would, with a scratch identity, then records its end. */
function runMergeWatcher(scene: CatchUpScene): string[] {
  const watcherFolder = join(scene.jobFolder(), 'target-merge');
  const launch = JSON.parse(readFileSync(watcherFilesOf(watcherFolder, 1).launchPath, 'utf8')) as { argv: string[]; workingDirectory: string };
  const [program = '', ...gitArguments] = launch.argv;
  const run = Bun.spawnSync({
    cmd: [program, ...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, ...gitArguments], cwd: launch.workingDirectory, stdout: 'pipe', stderr: 'pipe'
  });
  endWatcher(watcherFolder, run.exitCode);
  return launch.argv;
}

function handoffCycleResumes(scene: CatchUpScene): number {
  return Playbook.handoffCycleResumesOf({ kind: 'build', ticketIds: ['001'], attempt: 1 }, scene.board.logRecordsSoFar());
}

testWhenGitIsPresent('a branch that already holds the target tip starts its reviewer with no merge and no gate run', async () => {
  const scene = catchUpScene();

  await scene.pass();

  expect(scene.reviewJob()?.state).toBe('running');
  expect(scene.spawnedFolders).toEqual([]);
});

testWhenGitIsPresent('a branch behind the target gets the tip merged in by a process Watcher with every hook off, before any reviewer', async () => {
  const scene = catchUpScene();
  const targetTip = commitFile(scene.repository, 'main-only.txt', 'on main\n');

  await scene.pass();

  expect(scene.reviewJob()?.state).toBe('preparing');
  expect(scene.spawnedFolders).toEqual([join(scene.jobFolder(), 'target-merge')]);
  const argv = runMergeWatcher(scene);
  expect(argv).toContain(`core.hooksPath=${join(argv[0] ?? '', 'hooks-off')}`);
  expect(argv.slice(-5)).toEqual(['merge', '--no-ff', '--no-edit', '--quiet', targetTip]);
  expect(gitOutputIn(scene.worktree, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ')).toContain(targetTip);
});

testWhenGitIsPresent('after a clean merge the reviewer starts only once the gates on the merged tree are green', async () => {
  const scene = catchUpScene();
  commitFile(scene.repository, 'main-only.txt', 'on main\n');
  await scene.pass();
  runMergeWatcher(scene);

  await scene.pass();
  await scene.pass();
  expect(scene.reviewJob()?.state).toBe('preparing');
  expect(JobLaunch.observeBuildJobs(scene.context, scene.board.jobs(), PIPELINE)[0]?.targetCatchUp).toEqual({ verdict: 'gating', stepIndex: 0 });

  endWatcher(join(scene.jobFolder(), 'target-gate-1'), 0);
  await scene.pass();
  expect(scene.reviewJob()?.state).toBe('running');
});

testWhenGitIsPresent('a red gate on the merged tree sends the builder the red handoff, counted in its handoff cycle', async () => {
  const scene = catchUpScene();
  commitFile(scene.repository, 'main-only.txt', 'on main\n');
  await scene.pass();
  runMergeWatcher(scene);
  await scene.pass();
  await scene.pass();

  endWatcher(join(scene.jobFolder(), 'target-gate-1'), 1);
  await scene.pass();

  expect(scene.reviewJob()).toBeUndefined();
  expect(scene.board.tickets()[0]?.frontmatter.status).toBe('in-progress');
  expect(handoffCycleResumes(scene)).toBe(1);
  expect(RedHandoff.redHandoffFactsOf(scene.jobFolder())).toMatchObject({
    kind: 'gate', name: 'tests', command: 'bun test', exitCode: 1
  });
  expect(JobLaunch.targetCatchUpHandoverOf(scene.context.workspace.trackerDirectory, scene.board.logRecordsSoFar(), '001')).toMatchObject({ kind: 'gate-red' });
});

testWhenGitIsPresent('a conflict aborts the merge, leaves the worktree clean at the branch tip and sends the builder the conflicted files', async () => {
  const scene = catchUpScene();
  const branchTip = commitFile(scene.worktree, 'shared.txt', 'the branch line\n');
  const targetTip = commitFile(scene.repository, 'shared.txt', 'the main line\n');
  await scene.pass();
  runMergeWatcher(scene);

  await scene.pass();
  await scene.pass();

  expect(gitOutputIn(scene.worktree, ['rev-parse', 'HEAD'])).toBe(branchTip);
  expect(gitOutputIn(scene.worktree, ['status', '--porcelain'])).toBe('');
  expect(scene.reviewJob()).toBeUndefined();
  const reviewEnding = scene.board.logRecordsSoFar().findLast((record) => record.kind === 'job-ended' && record.jobId === scene.reviewJobId);
  expect(reviewEnding).toMatchObject({ fields: { outcome: 'does-not-hold', cause: BUILD_JOB_CAUSES.targetConflict } });
  expect(scene.board.tickets()[0]?.frontmatter.status).toBe('in-progress');
  expect(handoffCycleResumes(scene)).toBe(1);
  const handover = JobLaunch.targetCatchUpHandoverOf(scene.context.workspace.trackerDirectory, scene.board.logRecordsSoFar(), '001');
  expect(handover).toEqual({ kind: 'conflict', targetTip, conflictedFiles: ['shared.txt'] });
});
