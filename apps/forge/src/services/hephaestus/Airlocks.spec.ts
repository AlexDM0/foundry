/**
 * A group's Airlock in its own worktree (design section 6). What matters: a group's tickets and refreshes land by `merge --ff-only` in the
 * group's own worktree, a refresh is due only as MergeQueueUtil says and never beside a queued release, and the release lands the whole
 * bundle on main; a refused slot stops the merged-tree gates in its worktree as it frees. `Airlocks.mainLine.spec.ts` holds the main line's
 * slot and `Airlocks.conflicts.spec.ts` a conflict. The folders are real; git answers from recorded answer sets, one for each state of the
 * repository, each handing on to the next as a call moves it.
 */
import { existsSync } from 'node:fs';
import { join }       from 'node:path';

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
  revisionMissing,
  stepIn,
  treeRead
} from '../../testing/RecordedAirlockGit.ts';
import {
  GIT_CALL_SHAPES,
  useRecordedGit,
  type RecordedGitStage,
  type RecordedGitStep
} from '../../testing/RecordedGit.ts';
import { MOVED_AIRLOCK_IDS } from './testing/AirlockAnswerSets.ts';
import {
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness,
  type HarnessTicket
} from './testing/AirlocksHarness.ts';
import {
  aheadOfTheGroup,
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
  MAIN_TIP, TICKET_TIP, GROUP_TIP, MERGED_TIP, TICKET_TREE, MERGED_TREE
} = RECORDED_AIRLOCK_IDS;
const { OTHER_TREE, MOVED_BRANCH_TIP } = MOVED_AIRLOCK_IDS;


let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function kindsLogged(current: AirlocksHarness, kind: string): Record<string, unknown>[] {
  return current.board.logRecordsSoFar().filter((record) => record.kind === kind).map((record) => record as unknown as Record<string, unknown>);
}

function outcomesEnded(current: AirlocksHarness): string[] {
  return kindsLogged(current, 'job-ended').map((record) => (record['fields'] as { outcome: string }).outcome);
}

function asked(gitArguments: readonly string[]): boolean {
  return recordedGit.flowCalls().some((call) => JSON.stringify(call) === JSON.stringify(gitArguments));
}

describe('a group\'s slot in its own worktree', () => {
  test('a group ticket lands by merge --ff-only in the group worktree after the compare-and-swap, is approved, and main stays put', async () => {
    harness = createRecordedGroupHarness([{ id: '010', group: 'example' }]);
    const groupWorktree = groupWorktreeOf(harness);
    const beforeTheLanding: RecordedGitStep[] = [
      ...groupReads(GROUP_TIP, 'one'), ...candidateReads(harness, '010', GROUP_TIP, true), ...linkedWorktreeRead(groupWorktree, harness.repository),
    ];
    const landed: RecordedGitStage = [commitResolved(`refs/heads/${GROUP}`, TICKET_TIP), stepIn(groupWorktree, commitResolved('HEAD', TICKET_TIP)), ...beforeTheLanding];
    recordedGit.answerFrom([...beforeTheLanding, ...fastForwardIn(groupWorktree, GROUP, GROUP_TIP, TICKET_TIP, landed)]);

    await harness.slots.sweep();

    const [landing] = kindsLogged(harness, 'merge-landed').map((record) => record['fields'] as { commit: string; kind: string; target: string });
    expect(landing).toMatchObject({ target: GROUP, kind: 'integrated', commit: TICKET_TIP });
    expect(kindsLogged(harness, 'merge-started')[0]?.['fields']).toMatchObject({ target: GROUP, targetTip: GROUP_TIP });
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('reviewed');
    expect(outcomesEnded(harness)).toEqual(['integrated']);
  });

  test('a refresh merges main in a temporary worktree, lands the same way, and is not due again once the group holds main', async () => {
    harness = createRecordedGroupHarness([{ id: '010', group: 'example', status: 'reviewed' }], 1);
    const groupWorktree = groupWorktreeOf(harness);
    const refreshWorktree = join(`${harness.repository}-worktrees`, `refresh-${GROUP}`);
    const beforeTheMergeIn: RecordedGitStep[] = [
      ...groupReads(GROUP_TIP, 'one'),
      { gitArguments: ['worktree', 'add', '--quiet', '--detach', refreshWorktree, GROUP_TIP], answeredAs: GIT_CALL_SHAPES.WORKTREE_ADD_DETACHED, leavesFolder: refreshWorktree },
      stepIn(refreshWorktree, revisionMissing('MERGE_HEAD')),
      commitResolved(MAIN_TIP, MAIN_TIP),
      stepIn(refreshWorktree, commitResolved('HEAD', GROUP_TIP)),
      ancestryAsked(MAIN_TIP, GROUP_TIP, false),
      ...linkedWorktreeRead(groupWorktree, harness.repository),
    ];
    const landed: RecordedGitStage = [
      commitResolved(`refs/heads/${GROUP}`, MERGED_TIP),
      aheadOfTheGroup('none'),
      stepIn(groupWorktree, commitResolved('HEAD', MERGED_TIP)),
      { gitArguments: ['worktree', 'remove', refreshWorktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_CLEAN_WORKTREE, removesFolder: refreshWorktree },
      ...beforeTheMergeIn,
    ];
    const mergedIn: RecordedGitStage = [
      stepIn(refreshWorktree, commitResolved('HEAD', MERGED_TIP)),
      stepIn(refreshWorktree, treeRead('HEAD', OTHER_TREE)),
      ...beforeTheMergeIn,
      ...fastForwardIn(groupWorktree, GROUP, GROUP_TIP, MERGED_TIP, landed),
    ];
    recordedGit.answerFrom([
      ...beforeTheMergeIn,
      stepIn(refreshWorktree, { gitArguments: ['merge', '--no-ff', '--no-edit', '--quiet', MAIN_TIP], answeredAs: GIT_CALL_SHAPES.MERGE_IN_CLEAN, movesTo: mergedIn }),
    ]);

    await harness.slots.sweep();
    await harness.slots.sweep();

    const launched = kindsLogged(harness, 'job-launched').map((record) => record['fields'] as { kind: string; target: string });
    expect(launched).toEqual([expect.objectContaining({ kind: 'refresh', target: GROUP })]);
    expect(kindsLogged(harness, 'merge-started')[0]?.['fields']).toMatchObject({ target: GROUP, targetTip: GROUP_TIP, branchTip: MAIN_TIP });
    expect(asked(['merge', '--ff-only', '--quiet', MERGED_TIP])).toBe(true);
    expect(outcomesEnded(harness)).toEqual(['refreshed']);
    expect(existsSync(refreshWorktree)).toBe(false);
  });

  test('a refresh below GROUP_REFRESH_AFTER_MAIN_COMMITS with a clean prediction is not due', async () => {
    harness = createRecordedGroupHarness([{ id: '010', group: 'example', status: 'reviewed' }], 2);
    recordedGit.answerFrom(groupReads(GROUP_TIP, 'one'));
    await harness.slots.sweep();
    expect(kindsLogged(harness, 'job-launched')).toEqual([]);
  });

  const integratedTicket: HarnessTicket = { id: '010', group: 'example', status: 'reviewed' };
  const releaseBundle: HarnessTicket[] = [
    integratedTicket,
    {
      id: '012', group: 'example', releasesGroup: true, dependsOn: ['010']
    },
  ];

  function releaseAnswers(current: AirlocksHarness, holdsMain: boolean, branchDeleted: boolean, groupTipAtTheEnd = GROUP_TIP): RecordedGitStage {
    return releaseAnswersOf(current, holdsMain, branchDeleted, groupTipAtTheEnd).beforeTheMergeIn;
  }

  test('the release merges main once in its own worktree, gates, fast-forwards main, delivers the bundle and removes the group', async () => {
    harness = createRecordedGroupHarness([
      integratedTicket,
      {
        id: '011', group: 'example', status: 'reviewed', dependsOn: ['010']
      },
      {
        id: '012', group: 'example', releasesGroup: true, dependsOn: ['011']
      },
    ], 1);
    recordedGit.answerFrom(releaseAnswers(harness, false, true));

    await harness.slots.sweep();

    expect(kindsLogged(harness, 'job-launched').map((record) => (record['fields'] as { kind: string }).kind)).toEqual(['merge']);
    expect(kindsLogged(harness, 'merge-started')[0]?.['fields']).toMatchObject({ target: 'main', targetTip: MAIN_TIP, branchTip: TICKET_TIP });
    const [landing] = kindsLogged(harness, 'merge-landed').map((record) => record['fields'] as { commit: string; kind: string });
    expect(landing).toMatchObject({ kind: 'landed', commit: MERGED_TIP });
    expect(recordedGit.flowCalls().filter((call) => call[0] === 'merge' && call[1] === '--no-ff')).toEqual([['merge', '--no-ff', '--no-edit', '--quiet', MAIN_TIP]]);
    expect(harness.gatedTrees).toEqual([MERGED_TREE]);
    expect(harness.board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['delivered', 'delivered', 'delivered']);
    expect(existsSync(groupWorktreeOf(harness))).toBe(false);
    expect(asked(['branch', '-d', GROUP])).toBe(true);
  });

  test('a group branch given a commit main lacks before its release lands is kept, and git\'s branch -d refusal is reported', async () => {
    harness = createRecordedGroupHarness(releaseBundle);
    recordedGit.answerFrom(releaseAnswers(harness, true, false, MOVED_BRANCH_TIP));

    await harness.slots.sweep();

    expect(kindsLogged(harness, 'merge-landed').map((record) => (record['fields'] as { kind: string }).kind)).toEqual(['landed']);
    expect(harness.declinedCleanups).toEqual([{ cleanup: 'release', groupBranch: GROUP, reason: expect.stringContaining('branch -d') }]);
    expect(harness.declinedCleanups[0]?.reason).toContain('not fully merged');
  });

  test('a release whose branch lacks the group\'s tip is refused before its merge-in, so main and the bundle stay put, and its gates stop', async () => {
    harness = createRecordedGroupHarness(releaseBundle);
    recordedGit.answerFrom([
      ancestryAsked(GROUP_TIP, TICKET_TIP, false),
      ...releaseAnswers(harness, true, true),
      { gitArguments: ['reset', '--hard', '--quiet', TICKET_TIP], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT },
    ]);

    await harness.slots.sweep();

    expect(kindsLogged(harness, 'merge-landed')).toEqual([]);
    expect(recordedGit.flowCalls().filter((call) => call[1] === '--ff-only')).toEqual([]);
    expect(harness.board.decisions().filter((decision) => decision.kind === 'merge-refused').map((decision) => decision.ticketIds)).toEqual([['012']]);
    expect(harness.board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['reviewed', 'in-review']);
    expect(harness.gateStopsInWorktrees).toEqual([harness.worktreeOf('012')]);
  });

  test('a release ticket whose bundle has not all integrated waits, and the group is not refreshed while it is queued', async () => {
    harness = createRecordedGroupHarness([
      integratedTicket,
      {
        id: '012', group: 'example', releasesGroup: true, dependsOn: ['010', '011']
      },
      { id: '011', group: 'example' },
    ], 1);
    harness.board.setTicketMergeQueued('011', false, HARNESS_AT);
    recordedGit.answerFrom([...groupReads(GROUP_TIP, 'one'), treeRead('refs/heads/ticket-012', TICKET_TREE), treeRead('refs/heads/ticket-011', TICKET_TREE)]);
    await harness.slots.sweep();
    expect(kindsLogged(harness, 'job-launched')).toEqual([]);
    expect(harness.board.groupReleaseQueuedOrSlotted('example')).toBe('012');
  });
});
