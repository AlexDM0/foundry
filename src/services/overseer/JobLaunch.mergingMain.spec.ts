/**
 * With merge approval on, a green review, or a green build with no review step, merges the target into the ticket's worktree before the
 * ticket waits for User's Merge (`merging-main`). What matters: a worktree that holds the target's tip and whose green is current finishes
 * at once and queues; one that lacks it gets the tip merged in by a process Watcher with every hook off, and the merged tree is gated in the
 * job's own phase (review, or build with no review step) before it queues; a red gate and a conflict both go back to the job's own session,
 * the ticket's last worker, as a red handoff; a resolution larger than `airlock.reReview.thresholdLines`, or one git cannot measure, gets a
 * conflict re-reviewer before the gates, one at or below it and a pipeline with no `airlock.reReview` go straight on; a re-review that
 * does not hold fails the job. The crash rows: each round of a job keeps its own files, so a resumed session never reads an earlier round's
 * merge; a merge that ended while the Overseer was down is settled once; a replaced re-reviewer relaunches with the same attempt; and a stop
 * while a re-reviewer works stops it first. The folders are real; git answers from recorded answer sets, the launcher is fake, and the spec
 * ends the Watchers itself.
 */
import {
  existsSync,
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
import { watcherFilesOf }              from '../../lib/watcher/WatcherFiles.ts';
import { PRODUCT_NAMES }               from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import { nativePlatformPorts }         from '../../testing/NativePlatformPorts.ts';
import {
  ancestryAsked,
  commitResolved,
  linkedWorktreeRead,
  revisionMissing,
  treeRead,
  unmergedFilesRead
} from '../../testing/RecordedAirlockGit.ts';
import { GIT_CALL_SHAPES, type RecordedGitStep, useRecordedGit } from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }        from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                 from '../../testing/ToolGuard.ts';
import type { TrackerChange }                                    from '../tracker/TrackerPipeline.ts';
import type { GateRunSlots }                                     from './GateRunSlots.ts';
import {
  BUILD_JOB_CAUSES,
  JobLaunch,
  type BuildJobObservation,
  type JobLaunchContext
} from './JobLaunch.ts';
import type { ProcessStarts } from './ProcessStarts.ts';
import { RedHandoff }         from './RedHandoff.ts';
import { WatcherFleet }       from './WatcherFleet.ts';

const AT = '2026-11-12T10:00:00+01:00';
const TARGET = 'master';
const TARGET_TIP = '1'.repeat(40);
const BRANCH_TIP = '3'.repeat(40);
const MERGED_TIP = '7'.repeat(40);
const RESOLUTION_TIP = '9'.repeat(40);
const BRANCH_TREE = 'a'.repeat(40);
const MERGED_TREE = 'b'.repeat(40);
const RESOLVED_TREE = 'c'.repeat(40);
const TRACKER_ID = 'example-tracker-id';
const CLEAN_EXIT_CODE = 0;
const RED_EXIT_CODE = 1;
const CONFLICTED_FILE = 'shared.txt';
const RE_REVIEW_THRESHOLD_LINES = 10;

const REVIEW_PIPELINE: Pipeline = {
  version:   2,
  prepare:   [],
  gates:     [{ name: 'lint', run: 'bun run lint' }, { name: 'tests', run: 'bun test' }],
  phases:    { build: ['tests'], review: ['lint'], merge: ['lint'] },
  review:    { name: 'Review' },
  approvals: { merge: true },
};
const NO_REVIEW_PIPELINE: Pipeline = (({ review: _review, ...rest }) => rest)(REVIEW_PIPELINE);
const RE_REVIEW_PIPELINE: Pipeline = { ...REVIEW_PIPELINE, airlock: { reReview: { thresholdLines: RE_REVIEW_THRESHOLD_LINES } } };

const LINT_GATE = { name: 'lint', run: 'bun run lint' };
const KEPT_CONFLICT = { targetTip: TARGET_TIP, branchTip: BRANCH_TIP, conflictedFiles: [CONFLICTED_FILE] };

const recordedGit = useRecordedGit();

function newestEndingOf(board: Board): LogRecord | undefined {
  return board.logRecordsSoFar().findLast((record) => record.kind === 'job-ended');
}

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

interface MergingMainScene {
  board:          Board;
  context:        JobLaunchContext;
  repository:     string;
  worktree:       string;
  jobId:          string;
  spawnedFolders: string[];
  resolution:     { lines: number | null };
  pass:           () => Promise<BuildJobObservation[]>;
  job:            () => Readonly<Job> | undefined;
  jobFolder:      () => string;
  reReviewer:     () => Readonly<Job> | undefined;
}

/**
 * The ticket's job stands in `merging-main` after its green: a review job, its build ended `built`, or with no review step the build job
 * itself, its ticket still `in-progress`.
 */
function mergingMainScene(kind: 'review' | 'build', pipeline: Pipeline): MergingMainScene {
  const repository = realpathSync(createScratchDirectory('merging-main'));
  const monitorFolder = createScratchDirectory('m');
  folders.push(repository, monitorFolder);
  mkdirSync(join(repository, '.git'));
  const worktree = join(repository, PRODUCT_NAMES.WORKTREES_FOLDER, 'ticket-001');
  mkdirSync(worktree, { recursive: true });
  const trackerDirectory = join(repository, '.example-tracker');
  const { progress, tickets } = boardFixture({ tickets: [ticketFixture({ id: '001', status: kind === 'review' ? 'in-review' : 'in-progress', task: 1 })] });
  const board = new Board({
    progress, tickets, epics: [], logger: createLogger(() => undefined), pipeline
  });
  const build = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: TARGET
  }, AT);
  for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(build.job.id, state, AT);
  let jobId = build.job.id;
  if (kind === 'review') {
    board.endJob(build.job.id, { outcome: 'built' }, AT);
    const review = board.launchJob({
      kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: TARGET
    }, AT);
    board.startReviewBar('001', { round: 1, owner: review.job.id }, AT);
    for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(review.job.id, state, AT);
    jobId = review.job.id;
  }
  board.moveJob(jobId, 'merging-main', AT);
  const spawnedFolders: string[] = [];
  const processStarts = { spawnWatcher: (_ports: unknown, request: { jobFolder: string }) => spawnedFolders.push(request.jobFolder) } as unknown as ProcessStarts;
  const gateSlots = { tryAcquire: () => false, release: () => undefined, recordSpawnedProcess: () => undefined } as unknown as GateRunSlots;
  const resolution: { lines: number | null } = { lines: 0 };
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
    resolutionLinesOf:    () => resolution.lines,
    processStarts,
  } as unknown as JobLaunchContext;
  const change = { board, at: AT } as unknown as TrackerChange;
  const pass = async (): Promise<BuildJobObservation[]> => {
    const observations = JobLaunch.observeBuildJobs(context, board.jobs(), board.pipeline());
    JobLaunch.applyBuildJobObservations(change, context, observations);
    await JobLaunch.runBuildJobEffects(context, board, TRACKER_ID, observations);
    return observations;
  };
  return {
    board,
    context,
    repository,
    worktree,
    jobId,
    spawnedFolders,
    resolution,
    pass,
    job:        () => board.jobById(jobId),
    jobFolder:  () => WatcherFleet.jobFolderOf(trackerDirectory, jobId),
    reReviewer: () => board.jobs().find((candidate) => candidate.kind === 'merge-agent' && candidate.parentJobId === jobId),
  };
}

/** The worktree's HEAD at `head`, which holds the target's tip or lacks it, on `tree`. */
function worktreeAt(scene: MergingMainScene, head: string, holdsTheTarget: boolean, tree: string): RecordedGitStep[] {
  return [
    commitResolved(`refs/heads/${TARGET}`, TARGET_TIP),
    commitResolved('HEAD', head),
    ancestryAsked(TARGET_TIP, head, holdsTheTarget),
    treeRead('HEAD', tree),
    { gitArguments: ['diff', '--no-ext-diff', 'HEAD', '--'], answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE },
    ...linkedWorktreeRead(scene.worktree, scene.repository),
  ];
}

function cleanlyMerged(scene: MergingMainScene): RecordedGitStep[] {
  return [
    commitResolved('HEAD', MERGED_TIP),
    revisionMissing('MERGE_HEAD'),
    ancestryAsked(TARGET_TIP, MERGED_TIP, true),
    ancestryAsked(BRANCH_TIP, MERGED_TIP, true),
    treeRead('HEAD', MERGED_TREE),
    { gitArguments: ['diff', '--no-ext-diff', 'HEAD', '--'], answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE },
    ...linkedWorktreeRead(scene.worktree, scene.repository),
  ];
}

function stoppedOnAConflict(scene: MergingMainScene): RecordedGitStep[] {
  return [
    commitResolved('HEAD', BRANCH_TIP),
    commitResolved('MERGE_HEAD', TARGET_TIP),
    commitResolved(BRANCH_TIP, BRANCH_TIP),
    unmergedFilesRead(CONFLICTED_FILE),
    { gitArguments: ['merge', '--abort'], answeredAs: GIT_CALL_SHAPES.MERGE_ABORT_OF_A_CONFLICT },
    { gitArguments: ['reset', '--hard', '--quiet', BRANCH_TIP], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT },
    ...linkedWorktreeRead(scene.worktree, scene.repository),
  ];
}

function endWatcher(watcherFolder: string, exitCode: number): void {
  mkdirSync(watcherFolder, { recursive: true });
  writeFileSync(watcherFilesOf(watcherFolder, 1).watcherRecordPath, `${JSON.stringify({
    protocolVersion: 1, eventLogFormatVersion: 1, watcherInstance: 1, state: 'ended', watcher: null, end: { reason: 'exited', exitCode, signal: null },
  })}\n`);
}

/** The job's own session at `instance`, ended as its Watcher records it. */
function endSession(jobFolder: string, instance: number): void {
  writeFileSync(watcherFilesOf(jobFolder, instance).watcherRecordPath, `${JSON.stringify({
    protocolVersion: 1, eventLogFormatVersion: 1, watcherInstance: instance, state: 'ended', watcher: null, end: { reason: 'exited', exitCode: 0, signal: null },
  })}\n`);
}

function launchedMergeOf(scene: MergingMainScene, watcherFolder: string): { argv: string[]; workingDirectory: string } {
  return JSON.parse(readFileSync(watcherFilesOf(join(scene.jobFolder(), watcherFolder), 1).launchPath, 'utf8')) as { argv: string[]; workingDirectory: string };
}

function recordGreenOn(scene: MergingMainScene, tree: string, phase: 'build' | 'review'): void {
  scene.board.recordPipelineJudgedBy('001', tree, scene.board.gateRunStampOf(phase), AT);
}

/** The branch behind the target, its merge launched by one pass and ended clean, and the pass that asks for the merged tree's gates. */
async function cleanlyMergedScene(kind: 'review' | 'build', pipeline: Pipeline): Promise<MergingMainScene> {
  const scene = mergingMainScene(kind, pipeline);
  recordedGit.answerFrom(worktreeAt(scene, BRANCH_TIP, false, BRANCH_TREE));
  await scene.pass();
  endWatcher(join(scene.jobFolder(), 'main-merge'), CLEAN_EXIT_CODE);
  recordedGit.answerFrom(cleanlyMerged(scene));
  await scene.pass();
  await scene.pass();
  return scene;
}

/** The branch behind the target, its merge launched and stopped on a conflict, which the pass after sends to the job's session. */
async function conflictedScene(kind: 'review' | 'build', pipeline: Pipeline): Promise<MergingMainScene> {
  const scene = mergingMainScene(kind, pipeline);
  recordedGit.answerFrom(worktreeAt(scene, BRANCH_TIP, false, BRANCH_TREE));
  await scene.pass();
  endWatcher(join(scene.jobFolder(), 'main-merge'), RED_EXIT_CODE);
  recordedGit.answerFrom(stoppedOnAConflict(scene));
  await scene.pass();
  await scene.pass();
  return scene;
}

/** The session resumed on its conflict resolved it, reported and passed its own gates: the job is back in `merging-main`, round 2. */
async function resolvedScene(pipeline: Pipeline, resolutionLines: number | null): Promise<MergingMainScene> {
  const scene = await conflictedScene('review', pipeline);
  for (const state of ['running', 'in-customs', 'gating', 'merging-main'] as const) scene.board.moveJob(scene.jobId, state, AT);
  scene.resolution.lines = resolutionLines;
  recordedGit.answerFrom(worktreeAt(scene, RESOLUTION_TIP, true, RESOLVED_TREE));
  await scene.pass();
  return scene;
}

testWhenGitIsRecorded('a worktree that holds the target tip, its green current, finishes at once: the review ends and the ticket queues', async () => {
  const scene = mergingMainScene('review', REVIEW_PIPELINE);
  recordGreenOn(scene, BRANCH_TREE, 'review');
  recordedGit.answerFrom(worktreeAt(scene, BRANCH_TIP, true, BRANCH_TREE));

  await scene.pass();

  expect(scene.job()).toBeUndefined();
  expect(newestEndingOf(scene.board)).toMatchObject({ jobId: scene.jobId, fields: { outcome: 'reviewed', commit: BRANCH_TIP } });
  expect(scene.board.ticketIsMergeQueued('001')).toBe(true);
  expect(scene.spawnedFolders).toEqual([]);
});

testWhenGitIsRecorded('a worktree behind the target gets the tip merged in by a process Watcher with every hook off, and nothing queues yet', async () => {
  const scene = mergingMainScene('review', REVIEW_PIPELINE);
  recordedGit.answerFrom(worktreeAt(scene, BRANCH_TIP, false, BRANCH_TREE));

  await scene.pass();

  expect(scene.job()?.state).toBe('merging-main');
  expect(scene.spawnedFolders).toEqual([join(scene.jobFolder(), 'main-merge')]);
  const launch = launchedMergeOf(scene, 'main-merge');
  expect(launch.workingDirectory).toBe(scene.worktree);
  expect(launch.argv).toContain(`core.hooksPath=${join(launch.argv[0] ?? '', 'hooks-off')}`);
  expect(launch.argv.slice(-5)).toEqual(['merge', '--no-ff', '--no-edit', '--quiet', TARGET_TIP]);
  expect(scene.board.ticketIsMergeQueued('001')).toBe(false);
});

testWhenGitIsRecorded('the merged tree runs the review phase\'s gates; green ends the review and queues the ticket for User\'s Merge', async () => {
  const scene = await cleanlyMergedScene('review', REVIEW_PIPELINE);
  expect(JSON.parse(readFileSync(join(scene.jobFolder(), 'main-gate-run.json'), 'utf8'))).toMatchObject({ phase: 'review', gates: [{ name: 'lint' }] });
  expect(scene.job()?.state).toBe('merging-main');

  endWatcher(join(scene.jobFolder(), 'main-gate-1'), CLEAN_EXIT_CODE);
  await scene.pass();

  expect(scene.job()).toBeUndefined();
  expect(scene.board.ticketIsMergeQueued('001')).toBe(true);
  expect(scene.board.greenIsCurrent('001', MERGED_TREE, 'review')).toBe(true);
  expect(scene.board.tickets()[0]?.frontmatter.status).toBe('in-review');
});

testWhenGitIsRecorded('a red gate on the merged tree resumes the job\'s own session with the red handoff, and nothing queues', async () => {
  const scene = await cleanlyMergedScene('review', REVIEW_PIPELINE);

  endWatcher(join(scene.jobFolder(), 'main-gate-1'), RED_EXIT_CODE);
  await scene.pass();

  expect(scene.job()).toMatchObject({ state: 'interrupted', interruption: 'handoff-red', role: 'reviewer' });
  expect(RedHandoff.redHandoffFactsOf(scene.jobFolder())).toMatchObject({
    kind: 'gate', name: 'lint', command: 'bun run lint', exitCode: RED_EXIT_CODE
  });
  expect(scene.board.ticketIsMergeQueued('001')).toBe(false);
});

testWhenGitIsRecorded('a conflict aborts the merge, resets the worktree and resumes the reviewer\'s own session with the tip and the files', async () => {
  const scene = await conflictedScene('review', REVIEW_PIPELINE);

  const asked = recordedGit.flowCalls().map((gitArguments) => gitArguments.join(' '));
  expect(asked.indexOf(`reset --hard --quiet ${BRANCH_TIP}`)).toBeGreaterThan(asked.indexOf('merge --abort'));
  expect(scene.job()).toMatchObject({ state: 'interrupted', interruption: 'handoff-red', role: 'reviewer' });
  expect(RedHandoff.redHandoffFactsOf(scene.jobFolder())).toMatchObject({
    kind: 'merge-conflict', name: TARGET, mergedTip: TARGET_TIP, commit: BRANCH_TIP, resume: 1
  });
  expect(readFileSync(join(scene.jobFolder(), 'gate-failure.md'), 'utf8')).toContain(`- ${CONFLICTED_FILE}`);
  expect(JSON.parse(readFileSync(join(scene.jobFolder(), 'main-conflict.json'), 'utf8'))).toEqual(KEPT_CONFLICT);
  expect(scene.board.tickets()[0]?.frontmatter.status).toBe('in-review');
});

testWhenGitIsRecorded('a reviewer back from a resume merging-main sent it on goes to merging-main again, its review recorded only once', async () => {
  const scene = mergingMainScene('review', REVIEW_PIPELINE);
  const { board, context } = scene;
  board.recordReview('001', {
    verdict:                 'released',
    reviewStartCommit:       BRANCH_TIP,
    fixReworkedCodeLines:    0,
    rebaseReworkedCodeLines: 0,
    totalReworkedCodeLines:  0,
    builderChangedFiles:     1,
    builderInsertions:       1,
    builderDeletions:        0,
    claims:                  [],
    findings:                [],
  }, AT);
  board.interruptJob(scene.jobId, 'handoff-red', AT);
  for (const state of ['running', 'in-customs', 'gating'] as const) board.moveJob(scene.jobId, state, AT);
  const stamp = board.gateRunStampOf('review');
  if (stamp === null) throw new Error('The scene stores no pipeline.');
  JobLaunch.applyBuildJobObservations({ board, at: AT } as unknown as TrackerChange, context, [{
    jobId:    scene.jobId,
    setup:    'installed',
    calls:    1,
    report:   { headCommit: RESOLUTION_TIP },
    agentEnd: null,
    gate:     {
      verdict: 'judged', treeId: RESOLVED_TREE, outcome: 'passed', step: null, output: '', ran: true, manifest: { ...stamp, prepare: [], gates: [LINT_GATE] }
    },
    sandboxRefusal:   null,
    targetCatchUp:    { verdict: 'not-checked' },
    mainMerge:        null,
    conflictReReview: null,
  }]);

  expect(scene.job()?.state).toBe('merging-main');
  expect(board.logRecordsSoFar().filter((record) => record.kind === 'review-recorded')).toHaveLength(1);
});

testWhenGitIsRecorded('with no review step a green build waits in merging-main, its ticket in progress, unqueued and its Handoff unwritten', async () => {
  const scene = mergingMainScene('build', NO_REVIEW_PIPELINE);
  const { board, context } = scene;
  const gating = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 2, target: TARGET
  }, AT).job;
  board.endJob(scene.jobId, { outcome: 'replaced' }, AT);
  for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(gating.id, state, AT);
  const stamp = board.gateRunStampOf('build');
  if (stamp === null) throw new Error('The scene stores no pipeline.');
  const manifest = { ...stamp, prepare: [], gates: [{ name: 'tests', run: 'bun test' }] };
  JobLaunch.applyBuildJobObservations({ board, at: AT } as unknown as TrackerChange, context, [{
    jobId:    gating.id,
    setup:    'installed',
    calls:    1,
    report:   { headCommit: BRANCH_TIP, handoff: 'Example handoff.' },
    agentEnd: null,
    gate:     {
      verdict: 'judged', treeId: BRANCH_TREE, outcome: 'passed', step: null, output: '', ran: true, manifest
    },
    sandboxRefusal:   null,
    targetCatchUp:    { verdict: 'not-checked' },
    mainMerge:        null,
    conflictReReview: null,
  }]);

  expect(board.jobById(gating.id)?.state).toBe('merging-main');
  expect(board.tickets()[0]?.frontmatter.status).toBe('in-progress');
  expect(board.tickets()[0]?.body).not.toContain('Example handoff.');
  expect(board.ticketIsMergeQueued('001')).toBe(false);
});

testWhenGitIsRecorded('with no review step the builder\'s own session takes the conflict, and the merged tree runs the build phase\'s gates', async () => {
  const conflicted = await conflictedScene('build', NO_REVIEW_PIPELINE);
  expect(conflicted.job()).toMatchObject({
    kind: 'build', role: 'builder', state: 'interrupted', interruption: 'handoff-red'
  });
  expect(RedHandoff.redHandoffFactsOf(conflicted.jobFolder())).toMatchObject({ kind: 'merge-conflict', mergedTip: TARGET_TIP });

  const merged = await cleanlyMergedScene('build', NO_REVIEW_PIPELINE);
  expect(JSON.parse(readFileSync(join(merged.jobFolder(), 'main-gate-run.json'), 'utf8'))).toMatchObject({ phase: 'build', gates: [{ name: 'tests' }] });
  endWatcher(join(merged.jobFolder(), 'main-gate-1'), CLEAN_EXIT_CODE);
  await merged.pass();
  expect(newestEndingOf(merged.board)).toMatchObject({ fields: { outcome: 'built', commit: MERGED_TIP } });
  expect(merged.board.tickets()[0]?.frontmatter.status).toBe('in-review');
  expect(merged.board.tickets()[0]?.body).toContain('## Handoff');
  expect(merged.board.ticketIsMergeQueued('001')).toBe(true);
});

testWhenGitIsRecorded('a resolution larger than the merge train\'s re-review threshold gets a conflict re-reviewer as the conflict\'s round', async () => {
  const scene = await resolvedScene(RE_REVIEW_PIPELINE, RE_REVIEW_THRESHOLD_LINES + 1);

  expect(scene.reReviewer()).toMatchObject({
    kind: 'merge-agent', role: 'conflict-re-reviewer', parentJobId: scene.jobId, attempt: 1, ticketIds: ['001'], target: TARGET
  });
  const kept = JSON.parse(readFileSync(join(scene.jobFolder(), 'main-resolution.json'), 'utf8')) as unknown;
  expect(kept).toMatchObject({ conflictRound: 1, resolutionCommit: RESOLUTION_TIP, lines: RE_REVIEW_THRESHOLD_LINES + 1 });
  expect(JobLaunch.mainMergeConflictOf(scene.context.workspace.trackerDirectory, scene.job() as Readonly<Job>)).toEqual(KEPT_CONFLICT);
});

testWhenGitIsRecorded('a resolution git cannot measure is re-reviewed', async () => {
  const scene = await resolvedScene(RE_REVIEW_PIPELINE, null);

  expect(scene.reReviewer()?.role).toBe('conflict-re-reviewer');
});

testWhenGitIsRecorded('a resolution at the threshold, or with no airlock.reReview, goes straight to the gates in its own round', async () => {
  for (const [pipeline, lines] of [[RE_REVIEW_PIPELINE, RE_REVIEW_THRESHOLD_LINES], [REVIEW_PIPELINE, RE_REVIEW_THRESHOLD_LINES * 100]] as const) {
    const scene = await resolvedScene(pipeline, lines);
    expect(scene.reReviewer()).toBeUndefined();
    expect(existsSync(join(scene.jobFolder(), 'main-gate-required-2.json'))).toBe(true);
    expect(scene.job()?.state).toBe('merging-main');
  }
});

testWhenGitIsRecorded('a re-review that holds ends the re-reviewer reviewed, and the next pass gates the tree; one that does not hold fails the job', async () => {
  for (const verdict of [{ verdict: 'holds' } as const, { verdict: 'claims-refused', acceptanceItems: ['A1'] } as const]) {
    const scene = await resolvedScene(RE_REVIEW_PIPELINE, RE_REVIEW_THRESHOLD_LINES + 1);
    const reReviewer = scene.reReviewer();
    if (reReviewer === undefined) throw new Error('No conflict re-reviewer was launched.');
    for (const state of ['running', 'in-customs'] as const) scene.board.moveJob(reReviewer.id, state, AT);
    const change = { board: scene.board, at: AT } as unknown as TrackerChange;
    JobLaunch.applyBuildJobObservations(change, scene.context, [{
      jobId:            scene.jobId,
      setup:            'installed',
      calls:            0,
      report:           undefined,
      agentEnd:         null,
      gate:             { verdict: 'pending' },
      sandboxRefusal:   null,
      targetCatchUp:    { verdict: 'not-checked' },
      mainMerge:        { step: { verdict: 're-reviewing' }, resolution: null },
      conflictReReview: {
        jobId: reReviewer.id, calls: 1, sessionEnded: true, verdict
      },
    }]);
    const ending = newestEndingOf(scene.board);
    expect(ending).toMatchObject({ jobId: reReviewer.id, fields: { outcome: verdict.verdict === 'holds' ? 'reviewed' : 'does-not-hold' } });
    recordedGit.answerFrom(worktreeAt(scene, RESOLUTION_TIP, true, RESOLVED_TREE));
    await scene.pass();
    if (verdict.verdict === 'holds') {
      expect(scene.job()?.state).toBe('merging-main');
      expect(existsSync(join(scene.jobFolder(), 'main-gate-required-2.json'))).toBe(true);
    } else {
      expect(scene.job()).toBeUndefined();
      expect(newestEndingOf(scene.board)).toMatchObject({ jobId: scene.jobId, fields: { outcome: 'failed', cause: BUILD_JOB_CAUSES.reReviewFailed } });
    }
  }
});

testWhenGitIsRecorded('crash row: a resumed session\'s round keeps its own files, so a target that moved again is merged in a folder of its own', async () => {
  const scene = await conflictedScene('review', REVIEW_PIPELINE);
  for (const state of ['running', 'in-customs', 'gating', 'merging-main'] as const) scene.board.moveJob(scene.jobId, state, AT);
  recordedGit.answerFrom(worktreeAt(scene, RESOLUTION_TIP, false, RESOLVED_TREE));

  await scene.pass();

  expect(scene.spawnedFolders.at(-1)).toBe(join(scene.jobFolder(), 'main-merge-2'));
  expect(JSON.parse(readFileSync(join(scene.jobFolder(), 'main-merge-2.json'), 'utf8'))).toEqual({ startTip: RESOLUTION_TIP, mergedTip: TARGET_TIP });
});

testWhenGitIsRecorded('crash row: a merge that ended while the Overseer was down is settled once on the restart, and never run again', async () => {
  const scene = mergingMainScene('review', REVIEW_PIPELINE);
  recordedGit.answerFrom(worktreeAt(scene, BRANCH_TIP, false, BRANCH_TREE));
  await scene.pass();
  endWatcher(join(scene.jobFolder(), 'main-merge'), CLEAN_EXIT_CODE);
  recordedGit.answerFrom(cleanlyMerged(scene));

  await scene.pass();
  const settlement = readFileSync(join(scene.jobFolder(), 'main-merge-settlement.json'), 'utf8');
  await scene.pass();
  await scene.pass();

  expect(readFileSync(join(scene.jobFolder(), 'main-merge-settlement.json'), 'utf8')).toBe(settlement);
  expect(scene.spawnedFolders.filter((folder) => folder.endsWith('main-merge'))).toHaveLength(1);
  expect(JSON.parse(settlement)).toEqual({ verdict: 'merged', mergeCommit: MERGED_TIP });
});

testWhenGitIsRecorded('crash row: a re-reviewer whose session could not resume is replaced by a fresh one with the same attempt', async () => {
  const scene = await resolvedScene(RE_REVIEW_PIPELINE, RE_REVIEW_THRESHOLD_LINES + 1);
  const replaced = scene.reReviewer();
  if (replaced === undefined) throw new Error('No conflict re-reviewer was launched.');
  scene.board.endJob(replaced.id, { outcome: 'replaced', cause: 'resume-failed' }, AT);
  recordedGit.answerFrom(worktreeAt(scene, RESOLUTION_TIP, true, RESOLVED_TREE));

  await scene.pass();

  expect(scene.reReviewer()).toMatchObject({ role: 'conflict-re-reviewer', attempt: replaced.attempt, parentJobId: scene.jobId });
  expect(scene.reReviewer()?.id).not.toBe(replaced.id);
});

testWhenGitIsRecorded('crash row: a re-reviewer that ended any other way fails the job, as a failed pass', async () => {
  const scene = await resolvedScene(RE_REVIEW_PIPELINE, RE_REVIEW_THRESHOLD_LINES + 1);
  const reReviewer = scene.reReviewer();
  if (reReviewer === undefined) throw new Error('No conflict re-reviewer was launched.');
  scene.board.endJob(reReviewer.id, { outcome: 'stopped', cause: 'out-of-calls' }, AT);
  recordedGit.answerFrom(worktreeAt(scene, RESOLUTION_TIP, true, RESOLVED_TREE));

  await scene.pass();

  expect(scene.job()).toBeUndefined();
  expect(newestEndingOf(scene.board)).toMatchObject({ jobId: scene.jobId, fields: { outcome: 'failed', cause: BUILD_JOB_CAUSES.reReviewFailed } });
});

testWhenGitIsRecorded('crash row: a job stopped while its re-reviewer works stops the re-reviewer first, and ends once it ended', async () => {
  const scene = await resolvedScene(RE_REVIEW_PIPELINE, RE_REVIEW_THRESHOLD_LINES + 1);
  const reReviewer = scene.reReviewer();
  if (reReviewer === undefined) throw new Error('No conflict re-reviewer was launched.');
  scene.board.moveJob(reReviewer.id, 'running', AT);
  scene.board.requestJobStop(scene.jobId, 'stop', AT);
  endSession(scene.jobFolder(), scene.job()?.watcherInstance ?? 0);

  await scene.pass();
  expect(scene.reReviewer()?.state).toBe('stopping');
  expect(scene.job()?.state).toBe('stopping');

  await scene.pass();
  await scene.pass();
  expect(scene.reReviewer()).toBeUndefined();
  expect(scene.job()).toBeUndefined();
  expect(newestEndingOf(scene.board)).toMatchObject({ jobId: scene.jobId, fields: { outcome: 'stopped' } });
});
