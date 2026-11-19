/**
 * The merge rows of the crash, reboot and update matrix: an Airlock or a refresh cut short between git and the board, and what the next sweep
 * makes of it. What matters: a landing whose fast-forward git already made finishes the board side; a merge-in left with no live holder is
 * aborted, reset to its branch tip and requeued, never two refreshes on a group at once; a live or interrupted Airlock agent keeps its slot;
 * a conflict re-reviewer cut short keeps the slot while it lives, is relaunched as the same attempt once replaced, and frees the slot as
 * orphaned once it ended otherwise; a target moved by hand requeues and never lands on the moved tip; and a constitution commit job left in
 * `committing` is replaced, one cut short after its fast-forward finishes on the board side, a waiting request with no live job gets one,
 * and a main line already holding the text finishes Apply with no commit. After a start, a landing journal line a stop cut off is written
 * so a sibling requeues rather than meeting `target-moved`, a release's cleanup a stop cut off runs again once, and a slot a stop left
 * restored before its hold is held `interrupted:merge`. The other rows are in `CrashMatrix.integration.spec.ts`. The folders are real; git
 * answers from recorded answer sets, one for each state of the repository, and a crash after a git call is the case entering the set of the
 * state that call left.
 */
import { existsSync, mkdirSync } from 'node:fs';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { RepositoryLandings, type RepositoryLanding } from '../../lib/git/RepositoryLandings.ts';
import { INTERRUPTED_MERGE_HOLD }                     from '../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import {
  ancestryAsked,
  commitResolved,
  currentBranchRead,
  fastForwardLanding,
  hardResetTo,
  linkedWorktreeRead,
  revisionMissing,
  stepIn
} from '../../testing/RecordedAirlockGit.ts';
import {
  GIT_CALL_SHAPES,
  useRecordedGit,
  type RecordedGitStage,
  type RecordedGitStep
} from '../../testing/RecordedGit.ts';
import { Landing, type LandingRequest, type SharedRepositoryLanding } from '../lifecycle/Landing.ts';
import { GroupWorktrees }                                             from './GroupWorktrees.ts';
import { AirlockAnswerSets, MOVED_AIRLOCK_IDS, type MainLineLanding } from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  finishMergeAgent,
  HARNESS_AT,
  HARNESS_TRACKER_ID,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness,
  type HarnessTicket
} from './testing/AirlocksHarness.ts';
import {
  commitWorktreeOf,
  CONSTITUTION_COMMIT_IDS,
  ConstitutionCommitAnswers,
  DRAFT_CONSTITUTION_TEXT,
  requestConstitutionApply
} from './testing/ConstitutionCommitAnswers.ts';
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

const SIBLING_TRACKER_ID = 'tracker-example-gaia';
const SIBLING_COMMIT = MOVED_AIRLOCK_IDS.SECOND_TICKET_TIP;

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

function sharedRepositoryOf(current: AirlocksHarness): SharedRepositoryLanding {
  if (current.sharedRepository === null) throw new Error('The harness lands alone.');
  return current.sharedRepository;
}

function journaledLandings(current: AirlocksHarness): RepositoryLanding[] {
  const reading = RepositoryLandings.readLandingJournal(sharedRepositoryOf(current).files);
  return reading.verdict === 'readable' ? reading.landings : [];
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

  test('a stop between the fast-forward and the landing journal line, then a start: the line is written, and a sibling lands with no target-moved', async () => {
    harness = createRecordedAirlocksHarness([CHECKOUT_TICKET], {}, true, null, true);
    const current = harness;
    const { files } = sharedRepositoryOf(current);
    recordedGit.answerFrom(mainLineSetOf(current));
    current.settings.beforeGate = () => recordedGit.answerFrom(mainLineSetOf(current, { mainTip: TICKET_TIP }));

    await current.slots.sweep();

    expect(current.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(journaledLandings(current)).toEqual([{
      trackerId: HARNESS_TRACKER_ID, target: 'main', previousTip: MAIN_TIP, commit: TICKET_TIP
    }]);

    const sibling: SharedRepositoryLanding = { ...sharedRepositoryOf(current), trackerId: SIBLING_TRACKER_ID };
    const siblingLanding = (expectedTargetTip: string): LandingRequest => ({
      target:           { branch: 'main', directory: current.repository },
      mergedCommit:     SIBLING_COMMIT,
      expectedTargetTip,
      recordedLandings: [],
      hookPolicy:       'hooks-off',
      sharedRepository: sibling,
    });
    const requeued = await recordedGit.playStage([
      currentBranchRead('main'), commitResolved('refs/heads/main', TICKET_TIP), ancestryAsked(SIBLING_COMMIT, TICKET_TIP, false),
    ], () => Promise.resolve(Landing.landOnTarget(siblingLanding(MAIN_TIP))));
    const landed = await recordedGit.playStage(
      fastForwardLanding('main', TICKET_TIP, SIBLING_COMMIT, 'cart.ts'),
      () => Promise.resolve(Landing.landOnTarget(siblingLanding(TICKET_TIP)))
    );

    expect(requeued).toMatchObject({ verdict: 'refused', reason: 'target-moved-by-a-recorded-landing' });
    expect(landed).toEqual({ verdict: 'landed', commit: SIBLING_COMMIT, previousTip: TICKET_TIP });
    expect(RepositoryLandings.readLandingJournal(files)).toMatchObject({ verdict: 'readable', skippedLines: [] });
    expect(journaledLandings(current).map((landing) => landing.trackerId)).toEqual([HARNESS_TRACKER_ID, SIBLING_TRACKER_ID]);
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

  test('a stop between freeSlot\'s restore and its hold, then a start, holds the ticket interrupted:merge and merges nothing again', async () => {
    harness = createRecordedAirlocksHarness([CHECKOUT_TICKET]);
    const current = harness;
    current.board.claimAirlock({
      ticketId: '001', target: 'main', targetTip: MAIN_TIP, branchTip: TICKET_TIP, predictedConflictFiles: []
    }, () => 'main', current.branchTreeOf, HARNESS_AT);
    const orphanedJobId = current.mergeJob()?.id;
    current.settings.startHoldsOrphans = true;

    await recordedGit.playStage([revisionMissing('MERGE_HEAD'), ...hardResetTo(TICKET_TIP)], () => current.slots.sweep());

    expect(endedCauseOf(current, orphanedJobId)).toBe('orphaned');
    expect(current.board.tickets()[0]?.frontmatter.hold).toBe(INTERRUPTED_MERGE_HOLD);
    expect(current.mergeJob()).toBeUndefined();
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

describe('the conflict re-review rows', () => {
  /** A resolution past the merge train's threshold, its conflict re-reviewer launched in the Airlock's `re-reviewing` phase. */
  async function reReviewing(): Promise<AirlocksHarness> {
    const current = createRecordedAirlocksHarness([CHECKOUT_TICKET], {}, true, { reReview: { thresholdLines: 50 } });
    recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeIn('001'));
    await current.slots.sweep();
    current.settings.resolutionLines = 51;
    recordedGit.answerFrom(AirlockAnswerSets.resolvedAndMerged());
    finishMergeAgent(current, {
      outcome: 'resolved', resolvedFiles: ['shared.txt'], notes: '', reportKind: null
    });
    await current.slots.sweep();
    return current;
  }

  test('restart during a live or interrupted conflict re-reviewer: the slot is kept in re-reviewing and no agent is launched', async () => {
    harness = await reReviewing();
    const reReviewerId = harness.mergeAgent()?.id ?? '';
    harness.board.moveJob(reReviewerId, 'running', HARNESS_AT);
    harness.board.interruptJob(reReviewerId, 'reboot', HARNESS_AT);

    recordedGit.answerFrom([]);
    await harness.slots.sweep();

    expect(harness.mergeJob()?.airlock?.phase).toBe('re-reviewing');
    expect(harness.mergeAgent()?.id).toBe(reReviewerId);
    expect(kindsLogged(harness, 'job-launched').filter((record) => (record['fields'] as { kind: string }).kind === 'merge-agent')).toHaveLength(2);
  });

  test('a conflict re-reviewer replaced after a failed resume is relaunched as a conflict re-reviewer of the same attempt', async () => {
    harness = await reReviewing();
    const replaced = harness.mergeAgent();
    harness.board.endJob(replaced?.id ?? '', { outcome: 'replaced', cause: 'resume-failed' }, HARNESS_AT);

    recordedGit.answerFrom([]);
    await harness.slots.sweep();

    expect(harness.mergeAgent()).toMatchObject({ role: 'conflict-re-reviewer', attempt: replaced?.attempt });
    expect(harness.mergeAgent()?.id).not.toBe(replaced?.id);
    expect(harness.mergeJob()?.airlock?.phase).toBe('re-reviewing');
  });

  test('a conflict re-reviewer that ended otherwise leaves the slot orphaned: reset to the branch tip and requeued', async () => {
    harness = await reReviewing();
    const mergeJobId = harness.mergeJob()?.id;
    harness.board.endJob(harness.mergeAgent()?.id ?? '', { outcome: 'stopped', cause: 'example-stop' }, HARNESS_AT);

    recordedGit.answerFrom([revisionMissing('MERGE_HEAD'), ...hardResetTo(TICKET_TIP), ...AirlockAnswerSets.conflictingMergeIn('001')]);
    await harness.slots.sweep();

    expect(endedCauseOf(harness, mergeJobId)).toBe('orphaned');
    expect(recordedGit.flowCalls()).toContainEqual(['reset', '--hard', '--quiet', TICKET_TIP]);
    expect(harness.board.ticketIsMergeQueued('001')).toBe(true);
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

  test('a stop after the release\'s landing hold, before its cleanup, then a start: the group\'s worktree and branch are removed once', async () => {
    harness = createRecordedGroupHarness([
      { id: '010', group: 'example', status: 'reviewed' },
      {
        id: '012', group: 'example', releasesGroup: true, dependsOn: ['010']
      },
    ]);
    const current = harness;
    const groupWorktree = groupWorktreeOf(current);
    current.board.releaseTickets(['012', '010'], { branch: 'ticket-012', commit: TICKET_TIP }, HARNESS_AT);

    await recordedGit.playStage([
      commitResolved(`refs/heads/${GROUP}`, GROUP_TIP),
      { gitArguments: ['worktree', 'remove', groupWorktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_CLEAN_WORKTREE, removesFolder: groupWorktree },
      { gitArguments: ['branch', '-d', GROUP], answeredAs: GIT_CALL_SHAPES.BRANCH_DELETE_OF_A_MERGED_BRANCH },
    ], () => current.slots.sweep());
    await recordedGit.playStage([], () => current.slots.sweep());

    expect(existsSync(groupWorktree)).toBe(false);
    expect(current.declinedCleanups).toEqual([]);
  });

  test('a release cleanup git declines at the start is reported as after a landing', async () => {
    harness = createRecordedGroupHarness([{ id: '012', group: 'example', releasesGroup: true }]);
    const current = harness;
    const groupWorktree = groupWorktreeOf(current);
    current.board.releaseTickets(['012'], { branch: 'ticket-012', commit: TICKET_TIP }, HARNESS_AT);

    await recordedGit.playStage([
      commitResolved(`refs/heads/${GROUP}`, GROUP_TIP),
      { gitArguments: ['worktree', 'remove', groupWorktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_CLEAN_WORKTREE, removesFolder: groupWorktree },
      { gitArguments: ['branch', '-d', GROUP], answeredAs: GIT_CALL_SHAPES.BRANCH_DELETE_OF_AN_UNMERGED_BRANCH },
    ], () => current.slots.sweep());

    expect(current.declinedCleanups.map((declined) => [declined.cleanup, declined.groupBranch])).toEqual([['release', GROUP]]);
  });

  test('a released group that a later ticket of the group uses again is left standing at the start', async () => {
    harness = createRecordedGroupHarness([
      { id: '012', group: 'example', releasesGroup: true },
      { id: '014', group: 'example', status: 'pending' },
    ]);
    const current = harness;
    current.board.releaseTickets(['012'], { branch: 'ticket-012', commit: TICKET_TIP }, HARNESS_AT);
    recordedGit.answerFrom(groupReads(GROUP_TIP, 'none'));

    await current.slots.sweep();

    expect(recordedGit.flowCalls().filter((asked) => asked[0] === 'branch' || asked[0] === 'worktree')).toEqual([]);
    expect(existsSync(groupWorktreeOf(current))).toBe(true);
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

describe('the constitution commit rows', () => {
  const { COMMITTED_TIP, SECOND_COMMITTED_TIP, COMMITTED_BLOB } = CONSTITUTION_COMMIT_IDS;

  function harnessWithAClaimedCommit(): { current: AirlocksHarness; setupId: string } {
    harness = createRecordedAirlocksHarness([]);
    const current = harness;
    const setupId = requestConstitutionApply(current.board);
    current.board.claimConstitutionCommitSlot({ setupId, target: 'main', targetTip: MAIN_TIP }, HARNESS_AT);
    return { current, setupId };
  }

  function commitWalkOf(current: AirlocksHarness, jobId: string, committedTip: string, tipAtLanding = MAIN_TIP): RecordedGitStage {
    return ConstitutionCommitAnswers.constitutionCommitAnswersOf({
      repository: current.repository, jobId, mainTip: MAIN_TIP, committedTip, tipAtLanding
    });
  }

  test('a job left in committing by a run cut short is an orphan: its worktree goes, and a fresh job commits and lands', async () => {
    const { current, setupId } = harnessWithAClaimedCommit();
    mkdirSync(commitWorktreeOf(current.repository, 'J1'), { recursive: true });
    recordedGit.answerFrom([...commitWalkOf(current, 'J1', COMMITTED_TIP), ...commitWalkOf(current, 'J2', SECOND_COMMITTED_TIP)]);

    await current.slots.sweep();

    expect(endedCauseOf(current, 'J1')).toBe('orphaned');
    expect(fastForwardsAsked()).toEqual([SECOND_COMMITTED_TIP]);
    expect(kindsLogged(current, 'pipeline-applied').map((record) => record['setupId'])).toEqual([setupId]);
    expect(existsSync(commitWorktreeOf(current.repository, 'J1'))).toBe(false);
  });

  test('crash after the fast-forward, before the board write: the commit is main\'s tip, so the board side finishes and stage 2 runs', async () => {
    const { current, setupId } = harnessWithAClaimedCommit();
    const [job] = current.board.jobs();
    current.board.setJobSlot(job?.id ?? '', {
      target: 'main', targetTip: MAIN_TIP, branchTip: MAIN_TIP, phase: 'landing'
    });
    mkdirSync(commitWorktreeOf(current.repository, 'J1'), { recursive: true });
    recordedGit.answerFrom(commitWalkOf(current, 'J1', COMMITTED_TIP, COMMITTED_TIP));

    await current.slots.sweep();

    expect(fastForwardsAsked()).toEqual([]);
    expect(kindsLogged(current, 'merge-landed').map((record) => record['fields'])).toEqual([{ target: 'main', commit: COMMITTED_TIP, kind: 'landed' }]);
    expect(kindsLogged(current, 'pipeline-applied').map((record) => record['setupId'])).toEqual([setupId]);
    expect(current.board.pipelineSetup()).toBeNull();
  });

  test('a waiting request whose job ended before it landed gets a fresh job on the next sweep', async () => {
    const { current, setupId } = harnessWithAClaimedCommit();
    current.board.endJob('J1', { outcome: 'stopped', cause: 'example-crash' }, HARNESS_AT);
    recordedGit.answerFrom(commitWalkOf(current, 'J2', COMMITTED_TIP));

    await current.slots.sweep();

    expect(kindsLogged(current, 'merge-landed')).toHaveLength(1);
    expect(kindsLogged(current, 'pipeline-applied').map((record) => record['setupId'])).toEqual([setupId]);
  });

  test('main already holding the draft\'s text, as after a landing cut short or a commit by hand, finishes Apply with no commit', async () => {
    harness = createRecordedAirlocksHarness([]);
    const current = harness;
    const setupId = requestConstitutionApply(current.board);
    current.settings.mainConstitution = { verdict: 'read', constitution: { path: 'CONSTITUTION.md', markdown: DRAFT_CONSTITUTION_TEXT, blob: COMMITTED_BLOB } };
    recordedGit.answerFrom([]);

    await current.slots.sweep();

    expect(current.board.jobs()).toEqual([]);
    expect(kindsLogged(current, 'job-launched')).toEqual([]);
    expect(kindsLogged(current, 'pipeline-applied').map((record) => [record['setupId'], (record['fields'] as { constitutionCommit: unknown }).constitutionCommit]))
      .toEqual([[setupId, null]]);
  });
});
