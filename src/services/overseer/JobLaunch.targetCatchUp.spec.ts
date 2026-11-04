/**
 * A review job brings its branch up to the target's tip before its reviewer starts. What matters: a branch that holds the tip starts its
 * reviewer with no merge and no gate; one that lacks it gets the target merged in by a process Watcher with every hook off, and its
 * reviewer starts only once the gates are green on the merged tree; a red gate and a conflict both send the work back to the builder,
 * counted in its handoff cycle, and a conflict aborts the merge and resets the worktree to the branch tip. The folders are real; git answers
 * from recorded answer sets, one for each state of the worktree, the launcher is fake, and the spec ends the Watchers itself.
 */
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

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
  ancestryAsked,
  commitResolved,
  linkedWorktreeRead,
  revisionMissing,
  unmergedFilesRead
} from '../../testing/RecordedAirlockGit.ts';
import { GIT_CALL_SHAPES, type RecordedGitStep, useRecordedGit } from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }        from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                 from '../../testing/ToolGuard.ts';
import type { TrackerChange }                                    from '../tracker/TrackerPipeline.ts';
import type { GateRunSlots }                                     from './GateRunSlots.ts';
import { BUILD_JOB_CAUSES, JobLaunch, type JobLaunchContext }    from './JobLaunch.ts';
import type { ProcessStarts }                                    from './ProcessStarts.ts';
import { RedHandoff }                                            from './RedHandoff.ts';
import { WatcherFleet }                                          from './WatcherFleet.ts';

const AT = '2026-11-02T10:00:00+01:00';
const PIPELINE: Pipeline = { prepare: [], gates: [{ name: 'tests', run: 'bun test' }], review: { name: 'Review' } };
const TRACKER_ID = 'example-tracker-id';
const TARGET = 'master';
const TARGET_TIP = '1'.repeat(40);
const BRANCH_TIP = '3'.repeat(40);
const MERGED_TIP = '7'.repeat(40);
const CLEAN_EXIT_CODE = 0;
const CONFLICT_EXIT_CODE = 1;

const recordedGit = useRecordedGit();

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
  const repository = realpathSync(createScratchDirectory('catch-up'));
  const monitorFolder = createScratchDirectory('m');
  folders.push(repository, monitorFolder);
  // A worktree reading keeps only printed paths that exist, so the common folder git names is there.
  mkdirSync(join(repository, '.git'));
  const worktree = join(repository, PRODUCT_NAMES.WORKTREES_FOLDER, 'ticket-001');
  mkdirSync(worktree, { recursive: true });
  const trackerDirectory = join(repository, '.example-tracker');
  const { progress, tickets } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-review', task: 1 })] });
  const logRecords: LogRecord[] = [];
  const board = new Board({
    progress, tickets, epics: [], logger: createLogger((record) => logRecords.push(record)), pipeline: PIPELINE
  });
  const build = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: TARGET
  }, AT);
  for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(build.job.id, state, AT);
  board.endJob(build.job.id, { outcome: 'built' }, AT);
  const review = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: TARGET
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
    mainLine:             TARGET,
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

/** The branch at its tip and the target at `targetTip`, which the branch holds or lacks. */
function branchBeforeTheMerge(scene: CatchUpScene, holdsTheTarget: boolean): RecordedGitStep[] {
  return [
    commitResolved(`refs/heads/${TARGET}`, TARGET_TIP),
    commitResolved('HEAD', BRANCH_TIP),
    ancestryAsked(TARGET_TIP, BRANCH_TIP, holdsTheTarget),
    ...linkedWorktreeRead(scene.worktree, scene.repository),
  ];
}

function cleanlyMerged(scene: CatchUpScene): RecordedGitStep[] {
  return [
    commitResolved(`refs/heads/${TARGET}`, TARGET_TIP),
    commitResolved('HEAD', MERGED_TIP),
    revisionMissing('MERGE_HEAD'),
    ancestryAsked(TARGET_TIP, MERGED_TIP, true),
    ancestryAsked(BRANCH_TIP, MERGED_TIP, true),
    { gitArguments: ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'], answeredAs: GIT_CALL_SHAPES.TREE_OF_A_COMMIT_WITH_A_FILE },
    { gitArguments: ['diff', '--no-ext-diff', 'HEAD', '--'], answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE },
    ...linkedWorktreeRead(scene.worktree, scene.repository),
  ];
}

function stoppedOnAConflict(scene: CatchUpScene): RecordedGitStep[] {
  return [
    commitResolved(`refs/heads/${TARGET}`, TARGET_TIP),
    commitResolved('HEAD', BRANCH_TIP),
    commitResolved('MERGE_HEAD', TARGET_TIP),
    commitResolved(BRANCH_TIP, BRANCH_TIP),
    unmergedFilesRead('shared.txt'),
    { gitArguments: ['merge', '--abort'], answeredAs: GIT_CALL_SHAPES.MERGE_ABORT_OF_A_CONFLICT },
    { gitArguments: ['reset', '--hard', '--quiet', BRANCH_TIP], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT },
    ...linkedWorktreeRead(scene.worktree, scene.repository),
  ];
}

/** The process Watcher of one folder, ended with the given exit code, as the Watcher records it. */
function endWatcher(watcherFolder: string, exitCode: number): void {
  mkdirSync(watcherFolder, { recursive: true });
  writeFileSync(watcherFilesOf(watcherFolder, 1).watcherRecordPath, `${JSON.stringify({
    protocolVersion: 1, eventLogFormatVersion: 1, watcherInstance: 1, state: 'ended', watcher: null, end: { reason: 'exited', exitCode, signal: null },
  })}\n`);
}

/** Ends the merge Watcher the pass launched with `exitCode`, as git's merge would have ended it, and hands back the command it was given. */
function endMergeWatcher(scene: CatchUpScene, exitCode: number): string[] {
  const watcherFolder = join(scene.jobFolder(), 'target-merge');
  const launch = JSON.parse(readFileSync(watcherFilesOf(watcherFolder, 1).launchPath, 'utf8')) as { argv: string[]; workingDirectory: string };
  expect(launch.workingDirectory).toBe(scene.worktree);
  endWatcher(watcherFolder, exitCode);
  return launch.argv;
}

function handoffCycleResumes(scene: CatchUpScene): number {
  return Playbook.handoffCycleResumesOf({ kind: 'build', ticketIds: ['001'], attempt: 1 }, scene.board.logRecordsSoFar());
}

/** The branch behind the target, its merge launched and ended clean, and the passes that follow up to the gate. */
async function cleanlyMergedScene(): Promise<CatchUpScene> {
  const scene = catchUpScene();
  recordedGit.answerFrom(branchBeforeTheMerge(scene, false));
  await scene.pass();
  endMergeWatcher(scene, CLEAN_EXIT_CODE);
  recordedGit.answerFrom(cleanlyMerged(scene));
  await scene.pass();
  await scene.pass();
  return scene;
}

testWhenGitIsRecorded('a branch that already holds the target tip starts its reviewer with no merge and no gate run', async () => {
  const scene = catchUpScene();
  recordedGit.answerFrom(branchBeforeTheMerge(scene, true));

  await scene.pass();

  expect(scene.reviewJob()?.state).toBe('running');
  expect(scene.spawnedFolders).toEqual([]);
});

testWhenGitIsRecorded('a branch behind the target gets the tip merged in by a process Watcher with every hook off, before any reviewer', async () => {
  const scene = catchUpScene();
  recordedGit.answerFrom(branchBeforeTheMerge(scene, false));

  await scene.pass();

  expect(scene.reviewJob()?.state).toBe('preparing');
  expect(scene.spawnedFolders).toEqual([join(scene.jobFolder(), 'target-merge')]);
  const argv = endMergeWatcher(scene, CLEAN_EXIT_CODE);
  expect(argv).toContain(`core.hooksPath=${join(argv[0] ?? '', 'hooks-off')}`);
  expect(argv.slice(-5)).toEqual(['merge', '--no-ff', '--no-edit', '--quiet', TARGET_TIP]);
});

testWhenGitIsRecorded('after a clean merge the reviewer starts only once the gates on the merged tree are green', async () => {
  const scene = await cleanlyMergedScene();
  expect(scene.reviewJob()?.state).toBe('preparing');
  expect(JobLaunch.observeBuildJobs(scene.context, scene.board.jobs(), PIPELINE)[0]?.targetCatchUp).toEqual({ verdict: 'gating', stepIndex: 0 });

  endWatcher(join(scene.jobFolder(), 'target-gate-1'), 0);
  await scene.pass();
  expect(scene.reviewJob()?.state).toBe('running');
});

testWhenGitIsRecorded('a red gate on the merged tree sends the builder the red handoff, counted in its handoff cycle', async () => {
  const scene = await cleanlyMergedScene();

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

testWhenGitIsRecorded('a conflict aborts the merge, resets the worktree to the branch tip and sends the builder the conflicted files', async () => {
  const scene = catchUpScene();
  recordedGit.answerFrom(branchBeforeTheMerge(scene, false));
  await scene.pass();
  endMergeWatcher(scene, CONFLICT_EXIT_CODE);
  recordedGit.answerFrom(stoppedOnAConflict(scene));

  await scene.pass();
  await scene.pass();

  const askedAfterTheMerge = recordedGit.flowCalls().map((gitArguments) => gitArguments.join(' '));
  const abortAt = askedAfterTheMerge.indexOf('merge --abort');
  expect(abortAt).toBeGreaterThanOrEqual(0);
  expect(askedAfterTheMerge.indexOf(`reset --hard --quiet ${BRANCH_TIP}`)).toBeGreaterThan(abortAt);
  expect(scene.reviewJob()).toBeUndefined();
  const reviewEnding = scene.board.logRecordsSoFar().findLast((record) => record.kind === 'job-ended' && record.jobId === scene.reviewJobId);
  expect(reviewEnding).toMatchObject({ fields: { outcome: 'does-not-hold', cause: BUILD_JOB_CAUSES.targetConflict } });
  expect(scene.board.tickets()[0]?.frontmatter.status).toBe('in-progress');
  expect(handoffCycleResumes(scene)).toBe(1);
  const handover = JobLaunch.targetCatchUpHandoverOf(scene.context.workspace.trackerDirectory, scene.board.logRecordsSoFar(), '001');
  expect(handover).toEqual({ kind: 'conflict', targetTip: TARGET_TIP, conflictedFiles: ['shared.txt'] });
});
