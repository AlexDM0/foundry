/**
 * The Airlocks with merge approval on. What matters: nothing lands that User did not accept, on the main line and on a group target; an
 * accepted ticket whose merge-in conflicts goes back to waiting for merge with no agent launched; a red merged tree takes the accept and the
 * review done away and leaves the red handoff for the next reviewer, one resume further up the reviewer's ladder, or parks the ticket once
 * that ladder is spent; and an accepted green tree lands with no second approval.
 * The folders are real; git plays the recorded answers of `src/testing/RecordedGit.ts`, one stage per sweep, so a landing nobody accepted
 * would be a call the stage lacks.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join }                  from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  ancestryAsked,
  commitResolved,
  conflictAborted,
  emptyRangeCounted,
  fastForwardLanding,
  hardResetTo,
  linkedWorktreeRead,
  mergedIn,
  mergePredicted,
  revisionMissing,
  treeRead,
  worktreeBranchRead
} from '../../testing/RecordedAirlockGit.ts';
import type { RecordedGitStage, RecordedGitStep }                          from '../../testing/RecordedGit.ts';
import { useRecordedGit }                                                  from '../../testing/RecordedGit.ts';
import { describeWhenGitIsRecorded, testWhenGitIsRecorded }                from '../../testing/ToolGuard.ts';
import { GroupWorktrees }                                                  from './GroupWorktrees.ts';
import { RedHandoff }                                                      from './RedHandoff.ts';
import type { AirlocksHarness, HarnessTicket }                             from './testing/AirlocksHarness.ts';
import { createRecordedAirlocksHarness, HARNESS_AT, RECORDED_AIRLOCK_IDS } from './testing/AirlocksHarness.ts';

const recordedGit = useRecordedGit();

const BRANCH = 'ticket-001';
const GROUP_TARGET = 'group-checkout';
const {
  MAIN_TIP, TICKET_TIP: BRANCH_TIP, TICKET_TREE: BRANCH_TREE, MERGED_TIP: MERGED_COMMIT, MERGED_TREE
} = RECORDED_AIRLOCK_IDS;
const CHECKOUT_CHANGE: HarnessTicket['change'] = ['checkout.ts', 'export const checkout = 1;\n'];

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function plantedHarness(tickets: readonly HarnessTicket[], hasReviewPhase = true, mergeApprovalIsOn = true): AirlocksHarness {
  const current = createRecordedAirlocksHarness(tickets, {}, hasReviewPhase);
  current.board.setApproval('merge', mergeApprovalIsOn, HARNESS_AT);
  return current;
}

function sweepOn(current: AirlocksHarness, stage: RecordedGitStage): Promise<unknown> {
  return recordedGit.playStage(stage, () => current.slots.sweep());
}

function mergesStarted(current: AirlocksHarness): number {
  return current.board.logRecordsSoFar().filter((record) => record.kind === 'merge-started').length;
}

const BRANCH_TREE_READ = treeRead(`refs/heads/${BRANCH}`, BRANCH_TREE);
const BRANCH_TIP_READ = commitResolved(`refs/heads/${BRANCH}`, BRANCH_TIP);
const MAIN_TIP_READ = commitResolved('refs/heads/main', MAIN_TIP);

/** Each sweep reads the queued ticket's branch tree first. */
const QUEUE_READ: RecordedGitStage = [BRANCH_TREE_READ, BRANCH_TREE_READ];

/** The merge prediction into `target` and the merge job's tips, after the queue read and before the worktree's merge-in. */
function predictionInto(target: string, targetTip: string, prediction: RecordedGitStep): RecordedGitStage {
  return [
    BRANCH_TIP_READ,
    prediction,
    commitResolved(`refs/heads/${target}`, targetTip),
    commitResolved(`refs/heads/${target}`, targetTip),
    BRANCH_TIP_READ,
    BRANCH_TREE_READ,
  ];
}

function mergeInStart(targetTip: string, targetTipIsAncestor: boolean): RecordedGitStage {
  return [revisionMissing('MERGE_HEAD'), commitResolved(targetTip, targetTip), commitResolved('HEAD', BRANCH_TIP), ancestryAsked(targetTip, BRANCH_TIP, targetTipIsAncestor)];
}

/** A branch that already holds its target's tip: the merge-in changes no tree. */
function mergeInAlreadyHeld(targetTip: string): RecordedGitStage {
  return [...mergeInStart(targetTip, true), treeRead('HEAD', BRANCH_TREE), treeRead(BRANCH_TIP, BRANCH_TREE), commitResolved('HEAD', BRANCH_TIP)];
}

const LANDING_ON_MAIN: RecordedGitStage = [
  ...QUEUE_READ,
  ...predictionInto('main', MAIN_TIP, mergePredicted('main', BRANCH, BRANCH_TREE)),
  ...mergeInAlreadyHeld(MAIN_TIP),
  ...fastForwardLanding('main', MAIN_TIP, BRANCH_TIP, CHECKOUT_CHANGE[0]),
];

/** The main line moved since the branch forked: the merge-in makes a new tree, which the gate fails, so the worktree goes back to its tip. */
const RED_MERGED_TREE: RecordedGitStage = [
  ...QUEUE_READ,
  ...predictionInto('main', MAIN_TIP, mergePredicted('main', BRANCH, MERGED_TREE)),
  ...mergeInStart(MAIN_TIP, false),
  mergedIn(MAIN_TIP),
  commitResolved('HEAD', MERGED_COMMIT),
  treeRead('HEAD', MERGED_TREE),
  treeRead(BRANCH_TIP, BRANCH_TREE),
  commitResolved('HEAD', MERGED_COMMIT),
  revisionMissing('MERGE_HEAD'),
  ...hardResetTo(BRANCH_TIP),
];

testWhenGitIsRecorded('a reviewed ticket User did not accept waits for merge and never takes the main line\'s slot; once accepted it lands', async () => {
  harness = plantedHarness([{ id: '001', change: CHECKOUT_CHANGE }]);
  await sweepOn(harness, QUEUE_READ);
  expect(mergesStarted(harness)).toBe(0);
  expect(harness.board.ticketsWaitingForMergeOf('main', () => 'main', harness.branchTreeOf).map((waiting) => waiting.ticketId)).toEqual(['001']);

  harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
  await sweepOn(harness, LANDING_ON_MAIN);
  expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  expect(harness.board.decisions()).toEqual([]);
});

testWhenGitIsRecorded('a group ticket User did not accept is not integrated; once accepted it is', async () => {
  harness = plantedHarness([{ id: '001', group: 'checkout', change: CHECKOUT_CHANGE }]);
  const { repository } = harness;
  const groupWorktree = GroupWorktrees.groupWorktreeOf(`${repository}-worktrees`, GROUP_TARGET);
  const groupBehindNothing: RecordedGitStage = [commitResolved(`refs/heads/${GROUP_TARGET}`, MAIN_TIP), MAIN_TIP_READ, emptyRangeCounted(GROUP_TARGET, 'main')];
  await sweepOn(harness, [...QUEUE_READ, ...groupBehindNothing]);
  expect(mergesStarted(harness)).toBe(0);
  expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');

  harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
  const landedOnGroup: RecordedGitStage = [commitResolved(`refs/heads/${GROUP_TARGET}`, BRANCH_TIP), MAIN_TIP_READ, emptyRangeCounted(GROUP_TARGET, 'main')];
  await sweepOn(harness, [
    ...QUEUE_READ,
    ...groupBehindNothing,
    ...predictionInto(GROUP_TARGET, MAIN_TIP, mergePredicted(GROUP_TARGET, BRANCH, BRANCH_TREE)),
    ...mergeInAlreadyHeld(MAIN_TIP),
    commitResolved(`refs/heads/${GROUP_TARGET}`, MAIN_TIP),
    ...linkedWorktreeRead(groupWorktree, repository),
    worktreeBranchRead(GROUP_TARGET),
    ...fastForwardLanding(GROUP_TARGET, MAIN_TIP, BRANCH_TIP, CHECKOUT_CHANGE[0]),
    ...landedOnGroup,
    ...landedOnGroup,
  ]);
  expect(harness.board.tickets()[0]?.frontmatter.status).toBe('reviewed');
});

testWhenGitIsRecorded('an accepted ticket whose merge-in conflicts waits for merge again, its accept cleared and no agent launched', async () => {
  harness = plantedHarness([{ id: '001', change: ['base.ts', 'export const base = 2;\n'] }]);
  harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
  await sweepOn(harness, [
    ...QUEUE_READ,
    ...predictionInto('main', MAIN_TIP, mergePredicted('main', BRANCH, MERGED_TREE, 'base.ts')),
    ...mergeInStart(MAIN_TIP, false),
    mergedIn(MAIN_TIP, 'base.ts'),
    ...conflictAborted(MAIN_TIP, BRANCH_TIP, 'base.ts'),
    ...QUEUE_READ,
    ...QUEUE_READ,
  ]);
  expect(harness.board.jobs()).toEqual([]);
  expect(harness.mergeAgent()).toBeUndefined();
  expect(harness.board.ticketIsMergeAccepted('001')).toBe(false);
  expect(harness.board.ticketIsMergeQueued('001')).toBe(true);
  const ended = harness.board.logRecordsSoFar().findLast((record) => record.kind === 'job-ended');
  expect(ended?.kind === 'job-ended' ? ended.fields.cause : null).toBe('merge-accept-conflicted');
  expect(mergesStarted(harness)).toBe(1);
});

testWhenGitIsRecorded('a red merged tree clears the accept and the review done, resumes no Airlock agent, and leaves the red handoff for the next reviewer', async () => {
  harness = plantedHarness([{ id: '001', change: CHECKOUT_CHANGE }]);
  const review = harness.board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, HARNESS_AT);
  harness.board.endJob(review.job.id, { outcome: 'reviewed' }, HARNESS_AT);
  harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
  harness.settings.gateOutcome = 'failed';
  await sweepOn(harness, RED_MERGED_TREE);
  expect(harness.mergeAgent()).toBeUndefined();
  expect(harness.board.jobs()).toEqual([]);
  expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
  expect(harness.board.ticketIsMergeAccepted('001')).toBe(false);
  expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
  expect(existsSync(join(harness.repository, '.example-tracker', 'jobs', review.job.id, 'stale-green', 'red-handoff.json'))).toBe(true);
});

function writeOwnRedHandoff(jobFolder: string, resume: number): void {
  mkdirSync(jobFolder, { recursive: true });
  RedHandoff.writeRedHandoff(jobFolder, {
    kind:                'gate',
    name:                'tests',
    command:             null,
    fixCommand:          null,
    commit:              'example-commit',
    exitCode:            1,
    batonPassPath:       RedHandoff.batonPassPathOf(jobFolder),
    fullLogPath:         null,
    resume,
    resumesAllowed:      2,
    callBudget:          30,
    interruptedInstance: 1,
  }, 'expected 2, received 3');
}

describeWhenGitIsRecorded('a red merged tree after a reviewer whose ladder is not spent', () => {
  test.each([
    [0, 1],
    [1, 2],
  ])('a red merged tree after a reviewer at resume %i of its ladder leaves the stale-green handoff at resume %i', async (ownResume, staleGreenResume) => {
    harness = plantedHarness([{ id: '001', change: CHECKOUT_CHANGE }]);
    const review = harness.board.launchJob({
      kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, HARNESS_AT);
    const reviewFolder = join(harness.repository, '.example-tracker', 'jobs', review.job.id);
    if (ownResume > 0) writeOwnRedHandoff(reviewFolder, ownResume);
    harness.board.endJob(review.job.id, { outcome: 'reviewed' }, HARNESS_AT);
    harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
    harness.settings.gateOutcome = 'failed';
    await sweepOn(harness, RED_MERGED_TREE);
    expect(RedHandoff.redHandoffFactsOf(join(reviewFolder, 'stale-green'))).toMatchObject({ resume: staleGreenResume, resumesAllowed: 2 });
    expect(harness.board.tickets()[0]?.frontmatter.hold).toBeUndefined();
  });
});

testWhenGitIsRecorded('a red merged tree after a reviewer whose ladder is spent parks the ticket for User and leaves no stale-green handoff', async () => {
  harness = plantedHarness([{ id: '001', change: CHECKOUT_CHANGE }]);
  const review = harness.board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, HARNESS_AT);
  const reviewFolder = join(harness.repository, '.example-tracker', 'jobs', review.job.id);
  writeOwnRedHandoff(reviewFolder, 2);
  harness.board.endJob(review.job.id, { outcome: 'reviewed' }, HARNESS_AT);
  harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
  harness.settings.gateOutcome = 'failed';
  await sweepOn(harness, RED_MERGED_TREE);
  expect(harness.board.tickets()[0]?.frontmatter.hold).toBe('parked:red-resumes-spent');
  expect(harness.board.decisions().map((decision) => [decision.kind, decision.ticketIds])).toEqual([['parked', ['001']]]);
  expect(existsSync(join(reviewFolder, 'stale-green', 'red-handoff.json'))).toBe(false);
});

testWhenGitIsRecorded('without a review phase, a red merged tree returns the ticket to its builder and never waits for merge again', async () => {
  harness = plantedHarness([{ id: '001', change: CHECKOUT_CHANGE }], false);
  const build = harness.board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, HARNESS_AT);
  harness.board.endJob(build.job.id, { outcome: 'built' }, HARNESS_AT);
  harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
  harness.settings.gateOutcome = 'failed';
  await sweepOn(harness, RED_MERGED_TREE);
  await sweepOn(harness, []);
  expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-progress');
  expect(harness.board.ticketsWaitingForMergeOf('main', () => 'main', harness.branchTreeOf)).toEqual([]);
  expect(existsSync(join(harness.repository, '.example-tracker', 'jobs', build.job.id, 'stale-green', 'red-handoff.json'))).toBe(true);
});

testWhenGitIsRecorded('with merge approval off, a reviewed ticket with no accept lands as before', async () => {
  harness = plantedHarness([{ id: '001', change: CHECKOUT_CHANGE }], true, false);
  await sweepOn(harness, LANDING_ON_MAIN);
  expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
});
