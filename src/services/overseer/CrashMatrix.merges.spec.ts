/**
 * The merge rows of the crash, reboot and update matrix: an Airlock or a refresh cut short between git and the board, and what the next sweep
 * makes of it. What matters: a landing whose fast-forward git already made finishes the board side; a merge-in left with no live holder is
 * aborted, reset to its branch tip and requeued, never two refreshes on a group at once; a live or interrupted Airlock agent keeps its slot;
 * and a target moved by hand requeues and never lands on the moved tip. The other rows are in `CrashMatrix.integration.spec.ts`. The
 * folders are real; git answers from recorded answer sets, one for each state of the repository, and a crash after a git call is the case
 * entering the set of the state that call left.
 */
import { existsSync, mkdirSync } from 'node:fs';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import {
  ancestryAsked,
  commitResolved,
  linkedWorktreeRead,
  stepIn
} from '../../testing/RecordedAirlockGit.ts';
import {
  GIT_CALL_SHAPES,
  useRecordedGit,
  type RecordedGitStage,
  type RecordedGitStep
} from '../../testing/RecordedGit.ts';
import { GroupWorktrees }                                             from './GroupWorktrees.ts';
import { AirlockAnswerSets, MOVED_AIRLOCK_IDS, type MainLineLanding } from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  finishMergeAgent,
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness,
  type HarnessTicket
} from './testing/AirlocksHarness.ts';
import {
  candidateReads,
  createRecordedGroupHarness,
  fastForwardIn,
  GROUP,
  groupReads,
  groupWorktreeOf,
  releaseAnswersOf
} from './testing/GroupAirlockAnswers.ts';

const recordedGit = useRecordedGit();

const {
  MAIN_TIP, TICKET_TIP, GROUP_TIP, MERGED_TIP
} = RECORDED_AIRLOCK_IDS;

const CHECKOUT_TICKET: HarnessTicket = { id: '001' };

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function kindsLogged(current: AirlocksHarness, kind: string): Record<string, unknown>[] {
  return current.board.logRecordsSoFar().filter((record) => record.kind === kind).map((record) => record as unknown as Record<string, unknown>);
}

function endedCauseOf(current: AirlocksHarness, jobId: string | undefined): unknown {
  return (kindsLogged(current, 'job-ended').find((record) => record['jobId'] === jobId)?.['fields'] as { cause?: string } | undefined)?.cause;
}

function fastForwardsAsked(): string[] {
  return recordedGit.flowCalls().filter((asked) => asked[0] === 'merge' && asked[1] === '--ff-only').map((asked) => asked.at(-1) ?? '');
}

function mainLineSetOf(current: AirlocksHarness, landing: Partial<MainLineLanding> = {}): RecordedGitStage {
  return AirlockAnswerSets.mainLineAnswersOf({
    ticketId: '001', repository: current.repository, worktree: current.worktreeOf('001'), ...landing
  }).beforeTheMergeIn;
}

describe('the main-line merge rows', () => {
  test('crash after the fast-forward, before the board write: the merged commit is an ancestor of main, so the board side finishes', async () => {
    harness = createRecordedAirlocksHarness([CHECKOUT_TICKET]);
    const current = harness;
    recordedGit.answerFrom(mainLineSetOf(current));
    current.settings.beforeGate = () => recordedGit.answerFrom(mainLineSetOf(current, { mainTip: TICKET_TIP }));

    await current.slots.sweep();

    expect(current.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(fastForwardsAsked()).toEqual([]);
  });

  test('mid-merge with no live holder: merge --abort, a reset to branchTip and a requeue', async () => {
    harness = createRecordedAirlocksHarness([{ id: '001' }]);
    const current = harness;
    current.board.claimAirlock({
      ticketId: '001', target: 'main', targetTip: current.tipOf('main'), branchTip: TICKET_TIP, predictedConflictFiles: ['shared.txt']
    }, () => 'main', current.branchTreeOf, HARNESS_AT);
    const orphanedJobId = current.mergeJob()?.id;

    await recordedGit.playStage(AirlockAnswerSets.abortedAndMergedInAgain('001', true), () => current.slots.sweep());

    expect(endedCauseOf(current, orphanedJobId)).toBe('orphaned');
    expect(current.mergeJob()?.airlock?.branchTip).toBe(TICKET_TIP);
  });

  test('restart during a live or interrupted Airlock agent: the slot is kept, and the resolution then lands', async () => {
    harness = createRecordedAirlocksHarness([{ id: '001' }]);
    const current = harness;
    recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeIn('001'));
    await current.slots.sweep();
    const agentId = current.mergeAgent()?.id ?? '';
    current.board.moveJob(agentId, 'running', HARNESS_AT);
    current.board.interruptJob(agentId, 'reboot', HARNESS_AT);

    recordedGit.answerFrom([]);
    await current.slots.sweep();
    expect(current.mergeJob()?.airlock?.phase).toBe('resolving');

    current.board.moveJob(agentId, 'running', HARNESS_AT);
    recordedGit.answerFrom(AirlockAnswerSets.resolvedAndMerged());
    finishMergeAgent(current, {
      outcome: 'resolved', resolvedFiles: ['shared.txt'], notes: '', reportKind: null
    });
    await current.slots.sweep();
    expect(current.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('target moved by hand: the compare-and-swap requeues from branchTip and never lands on the moved tip', async () => {
    harness = createRecordedAirlocksHarness([CHECKOUT_TICKET]);
    const current = harness;
    recordedGit.answerFrom(mainLineSetOf(current));
    current.settings.beforeGate = () => {
      recordedGit.answerFrom(mainLineSetOf(current, { mainTip: MOVED_AIRLOCK_IDS.MOVED_MAIN_TIP, holdsMainLine: false }));
      current.settings.beforeGate = () => undefined;
    };

    await current.slots.sweep();

    const landed = kindsLogged(current, 'merge-landed').map((record) => (record['fields'] as { commit: string }).commit);
    expect(landed).toEqual([MERGED_TIP]);
    expect(fastForwardsAsked()).toEqual([MERGED_TIP]);
    expect(recordedGit.flowCalls()).toContainEqual(['merge', '--no-ff', '--no-edit', '--quiet', MOVED_AIRLOCK_IDS.MOVED_MAIN_TIP]);
  });
});

describe('the group merge rows', () => {
  test('crash after a group ticket\'s fast-forward, before the board write: the group tip holds the merged commit, so it is approved', async () => {
    harness = createRecordedGroupHarness([{ id: '010', group: 'example' }]);
    const current = harness;
    const groupWorktree = groupWorktreeOf(current);
    const beforeTheLanding: RecordedGitStep[] = [
      ...groupReads(GROUP_TIP, 'one'), ...candidateReads(current, '010', GROUP_TIP, true), ...linkedWorktreeRead(groupWorktree, current.repository),
    ];
    const landed: RecordedGitStage = [
      commitResolved(`refs/heads/${GROUP}`, TICKET_TIP),
      stepIn(groupWorktree, commitResolved('HEAD', TICKET_TIP)),
      ancestryAsked(TICKET_TIP, TICKET_TIP, true),
      ...beforeTheLanding,
    ];
    recordedGit.answerFrom([...beforeTheLanding, ...fastForwardIn(groupWorktree, GROUP, GROUP_TIP, TICKET_TIP, landed)]);
    current.settings.beforeGate = () => recordedGit.answerFrom([...landed, ...fastForwardIn(groupWorktree, GROUP, TICKET_TIP, TICKET_TIP, landed)]);

    await current.slots.sweep();

    expect(current.board.tickets()[0]?.frontmatter.status).toBe('reviewed');
    expect(kindsLogged(current, 'merge-landed')).toHaveLength(1);
    expect(fastForwardsAsked()).toEqual([]);
  });

  test('crash after the release\'s fast-forward of main, before the board write: the whole bundle is delivered', async () => {
    harness = createRecordedGroupHarness([
      { id: '010', group: 'example', status: 'reviewed' },
      {
        id: '012', group: 'example', releasesGroup: true, dependsOn: ['010']
      },
    ]);
    const current = harness;
    const release = releaseAnswersOf(current, true, true);
    recordedGit.answerFrom(release.beforeTheMergeIn);
    current.settings.beforeGate = () => recordedGit.answerFrom([...release.landed, ancestryAsked(TICKET_TIP, TICKET_TIP, true), ...release.beforeTheMergeIn]);

    await current.slots.sweep();

    expect(current.board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['delivered', 'delivered']);
    expect(fastForwardsAsked()).toEqual([]);
  });

  test('a refresh mid-merge with no live holder: aborted, its temporary worktree removed, and never two refreshes on the group at once', async () => {
    harness = createRecordedGroupHarness([{ id: '010', group: 'example', status: 'reviewed' }]);
    const current = harness;
    const { job: orphaned } = current.board.claimRefreshSlot({
      group: 'example', target: GROUP, targetTip: GROUP_TIP, mainTip: MAIN_TIP
    }, HARNESS_AT);
    const refreshWorktree = GroupWorktrees.refreshWorktreeOf(`${current.repository}-worktrees`, GROUP);
    mkdirSync(refreshWorktree, { recursive: true });
    const orphanedMergeIn: RecordedGitStep[] = [
      ...linkedWorktreeRead(refreshWorktree, current.repository),
      stepIn(refreshWorktree, commitResolved('HEAD', GROUP_TIP)),
      stepIn(refreshWorktree, commitResolved('MERGE_HEAD', MAIN_TIP)),
      stepIn(refreshWorktree, commitResolved('MERGE_HEAD', MAIN_TIP)),
      { gitArguments: ['merge', '--abort'], answeredAs: GIT_CALL_SHAPES.MERGE_ABORT_OF_A_CONFLICT },
      commitResolved(GROUP_TIP, GROUP_TIP),
      { gitArguments: ['reset', '--hard', '--quiet', GROUP_TIP], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT },
      commitResolved('HEAD', GROUP_TIP),
      { gitArguments: ['worktree', 'remove', refreshWorktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_CLEAN_WORKTREE, removesFolder: refreshWorktree },
    ];

    await recordedGit.playStage([...orphanedMergeIn, ...AirlockAnswerSets.conflictingGroupRefresh(current, 'example')], () => current.slots.sweep());

    const records = current.board.logRecordsSoFar();
    expect(endedCauseOf(current, orphaned.id)).toBe('orphaned');
    expect(existsSync(refreshWorktree)).toBe(false);
    // The requeued refresh meets the same conflict, which aborts it and asks User.
    const refreshJobIds = new Set(records.flatMap((record) => (record.kind === 'job-launched' && record.fields.kind === 'refresh' ? [record.jobId] : [])));
    expect(refreshJobIds.size).toBe(2);
    let openRefreshes = 0;
    let mostOpenRefreshes = 0;
    records.forEach((record) => {
      if (record.kind === 'job-launched' && refreshJobIds.has(record.jobId)) openRefreshes += 1;
      if (record.kind === 'job-ended' && refreshJobIds.has(record.jobId)) openRefreshes -= 1;
      mostOpenRefreshes = Math.max(mostOpenRefreshes, openRefreshes);
    });
    expect(mostOpenRefreshes).toBe(1);
    expect(current.board.jobs().filter((job) => job.kind === 'refresh')).toEqual([]);
    expect(current.board.decisions().map((decision) => [decision.kind, decision.ticketIds])).toEqual([['merge-refused', []]]);
    expect(fastForwardsAsked()).toEqual([]);
  });
});
