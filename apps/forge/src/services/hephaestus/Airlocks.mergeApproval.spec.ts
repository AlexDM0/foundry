/**
 * The Airlocks with merge approval on. What matters: nothing lands that User did not accept, on the main line and on a group target; once
 * accepted, the ticket runs the same merge train as with merge approval off: a conflict or a red merged tree goes to its last worker in the
 * Airlock, its accept and queue mark kept, never back to a reviewer outside it nor to `in-progress`; an accepted green tree lands with
 * no second approval; and the train takes the accepted tickets in User's press order, never by priority.
 * The folders are real; git plays the recorded answers of `src/testing/RecordedGit.ts`, one stage per sweep, so a landing nobody accepted
 * would be a call the stage lacks; the accepted tickets' Airlock agents answer from the recorded answer sets of
 * `src/services/hephaestus/testing/AirlockAnswerSets.ts`.
 */
import { existsSync } from 'node:fs';
import { join }       from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  ancestryAsked,
  commitResolved,
  emptyRangeCounted,
  fastForwardLanding,
  linkedWorktreeRead,
  mergePredicted,
  revisionMissing,
  treeRead,
  worktreeBranchRead
} from '../../testing/RecordedAirlockGit.ts';
import type { RecordedGitStage, RecordedGitStep }           from '../../testing/RecordedGit.ts';
import { useRecordedGit }                                   from '../../testing/RecordedGit.ts';
import { describeWhenGitIsRecorded, testWhenGitIsRecorded } from '../../testing/ToolGuard.ts';
import { GroupWorktrees }                                   from './GroupWorktrees.ts';
import { RedHandoff }                                       from './RedHandoff.ts';
import { AirlockAnswerSets }                                from './testing/AirlockAnswerSets.ts';
import type { AirlocksHarness, HarnessTicket }              from './testing/AirlocksHarness.ts';
import {
  createRecordedAirlocksHarness,
  finishMergeAgent,
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS
} from './testing/AirlocksHarness.ts';

const recordedGit = useRecordedGit();

const BRANCH = 'ticket-001';
const GROUP_TARGET = 'group-checkout';
const { MAIN_TIP, TICKET_TIP: BRANCH_TIP, TICKET_TREE: BRANCH_TREE } = RECORDED_AIRLOCK_IDS;
const CHECKOUT_FILE = 'checkout.ts';

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
  ...fastForwardLanding('main', MAIN_TIP, BRANCH_TIP, CHECKOUT_FILE),
];

testWhenGitIsRecorded('a reviewed ticket User did not accept waits for merge and never takes the main line\'s slot; once accepted it lands', async () => {
  harness = plantedHarness([{ id: '001' }]);
  await sweepOn(harness, QUEUE_READ);
  expect(mergesStarted(harness)).toBe(0);
  expect(harness.board.ticketsWaitingForMergeOf('main', () => 'main', harness.branchTreeOf).map((waiting) => waiting.ticketId)).toEqual(['001']);

  harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
  await sweepOn(harness, LANDING_ON_MAIN);
  expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  expect(harness.board.decisions()).toEqual([]);
});

testWhenGitIsRecorded('a group ticket User did not accept is not integrated; once accepted it is', async () => {
  harness = plantedHarness([{ id: '001', group: 'checkout' }]);
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
    ...fastForwardLanding(GROUP_TARGET, MAIN_TIP, BRANCH_TIP, CHECKOUT_FILE),
    ...landedOnGroup,
    ...landedOnGroup,
  ]);
  expect(harness.board.tickets()[0]?.frontmatter.status).toBe('reviewed');
});

/** The ticket's reviewer ended its review, so the history names it as the last worker. */
function reviewedByItsReviewer(current: AirlocksHarness): string {
  const review = current.board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, HARNESS_AT);
  current.board.endJob(review.job.id, { outcome: 'reviewed' }, HARNESS_AT);
  return review.job.id;
}

describeWhenGitIsRecorded('an accepted ticket in the merge train', () => {
  test('whose merge-in conflicts goes to its last worker in the Airlock, its accept kept, and lands once resolved', async () => {
    harness = plantedHarness([{ id: '001' }]);
    reviewedByItsReviewer(harness);
    harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
    recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeIn('001'));

    await harness.slots.sweep();

    expect(harness.mergeAgent()).toMatchObject({ kind: 'merge-agent', role: 'reviewer', attempt: 1 });
    expect(harness.mergeJob()?.airlock?.phase).toBe('resolving');
    expect(harness.board.ticketIsMergeAccepted('001')).toBe(true);
    expect(harness.board.ticketIsMergeQueued('001')).toBe(true);
    expect(harness.board.decisions()).toEqual([]);

    recordedGit.answerFrom(AirlockAnswerSets.resolvedAndMerged());
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: ['shared.txt'], notes: '', reportKind: null
    });
    await harness.slots.sweep();
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('whose merged tree is red resumes its last worker in the Airlock with the red handoff, its accept and queue mark kept', async () => {
    harness = plantedHarness([{ id: '001' }]);
    const reviewJobId = reviewedByItsReviewer(harness);
    harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
    harness.settings.gateOutcome = 'failed';
    recordedGit.answerFrom(AirlockAnswerSets.branchHoldingTheMainLine('001'));

    await harness.slots.sweep();

    expect(harness.mergeAgent()).toMatchObject({ kind: 'merge-agent', role: 'reviewer' });
    expect(harness.mergeJob()?.airlock?.phase).toBe('fixing');
    expect(RedHandoff.redHandoffFactsOf(join(harness.repository, '.example-tracker', 'jobs', harness.mergeJob()?.id ?? ''))).toMatchObject({ name: 'tests', resume: 1 });
    expect(existsSync(join(harness.repository, '.example-tracker', 'jobs', reviewJobId, 'stale-green', 'red-handoff.json'))).toBe(false);
    expect(harness.board.ticketIsMergeAccepted('001')).toBe(true);
    expect(harness.board.ticketIsMergeQueued('001')).toBe(true);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
  });

  test('without a review step, a red merged tree goes to the builder in the Airlock and never back to in-progress', async () => {
    harness = plantedHarness([{ id: '001' }], false);
    const build = harness.board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, HARNESS_AT);
    harness.board.endJob(build.job.id, { outcome: 'built' }, HARNESS_AT);
    harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
    harness.settings.gateOutcome = 'failed';
    recordedGit.answerFrom(AirlockAnswerSets.branchHoldingTheMainLine('001'));

    await harness.slots.sweep();

    expect(harness.mergeAgent()).toMatchObject({ kind: 'merge-agent', role: 'builder' });
    expect(harness.mergeJob()?.airlock?.phase).toBe('fixing');
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
  });
});

testWhenGitIsRecorded('with merge approval off, a reviewed ticket with no accept lands as before', async () => {
  harness = plantedHarness([{ id: '001' }], true, false);
  await sweepOn(harness, LANDING_ON_MAIN);
  expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
});

testWhenGitIsRecorded('the train takes the accepted tickets in User\'s press order: a high priority accepted later waits', async () => {
  harness = plantedHarness([{ id: '001', priority: 'high' }, { id: '002' }]);
  harness.board.setTicketMergeAccepted('002', true, HARNESS_AT);
  harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
  // The merge-in left by a live holder keeps its slot, so the sweep stops once the train took its first ticket.
  harness.settings.childIsLive = true;
  recordedGit.answerFrom([
    ...['001', '002'].flatMap((ticketId) => [
      treeRead(`refs/heads/ticket-${ticketId}`, BRANCH_TREE),
      commitResolved(`refs/heads/ticket-${ticketId}`, BRANCH_TIP),
      mergePredicted('main', `ticket-${ticketId}`, BRANCH_TREE),
    ]),
    MAIN_TIP_READ,
    commitResolved('MERGE_HEAD', MAIN_TIP),
  ]);

  await harness.slots.sweep();

  expect(mergesStarted(harness)).toBe(1);
  expect(harness.mergeJob()?.ticketIds).toEqual(['002']);
});
