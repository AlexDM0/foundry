/**
 * The recorded git answers of one ticket's Airlock on the main line, one set for each state its repository is in, and the ordered stage of
 * a group refresh that stops on a conflict, for a harness of `createRecordedAirlocksHarness`. Test-only.
 */
import { join } from 'node:path';

import {
  ancestryAsked,
  commitResolved,
  currentBranchRead,
  mergedIn,
  mergeInAborted,
  mergePredicted,
  revisionMissing,
  stepIn,
  treeRead,
  unmergedFilesRead
} from '../../../testing/RecordedAirlockGit.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStage,
  type RecordedGitStep
} from '../../../testing/RecordedGit.ts';
import { RECORDED_AIRLOCK_IDS, type AirlocksHarness } from './AirlocksHarness.ts';

const MAIN_LINE = 'main';
const CONFLICTED_FILE = 'shared.txt';

const {
  MAIN_TIP, TICKET_TIP, GROUP_TIP, MERGED_TIP, TICKET_TREE, MERGED_TREE
} = RECORDED_AIRLOCK_IDS;

function mergeTree(target: string, branch: string, conflicts: boolean): RecordedGitStep {
  return conflicts ? mergePredicted(target, branch, MERGED_TREE, CONFLICTED_FILE) : mergePredicted(target, branch, TICKET_TREE);
}

const mergeInOfAConflict = (commit: string): RecordedGitStep[] => [mergedIn(commit, CONFLICTED_FILE), unmergedFilesRead(CONFLICTED_FILE)];

/** The ticket's branch and the main line as they stand when the Airlock is taken, before any merge-in. */
function beforeTheMergeIn(ticketId: string, conflicts: boolean): RecordedGitStep[] {
  return [
    treeRead(`refs/heads/ticket-${ticketId}`, TICKET_TREE),
    commitResolved(`refs/heads/ticket-${ticketId}`, TICKET_TIP),
    mergeTree(MAIN_LINE, `ticket-${ticketId}`, conflicts),
    commitResolved(`refs/heads/${MAIN_LINE}`, MAIN_TIP),
    revisionMissing('MERGE_HEAD'),
    commitResolved(MAIN_TIP, MAIN_TIP),
    commitResolved('HEAD', TICKET_TIP),
  ];
}

/** A merge-in stopped on its conflict, aborted and reset to the ticket's branch tip. */
const abortedMergeIn = mergeInAborted(MAIN_TIP, TICKET_TIP);

/** More planted ids, for a main line or a branch that moves while a case runs. */
export const MOVED_AIRLOCK_IDS = {
  MOVED_MAIN_TIP:        '2'.repeat(40),
  SECOND_MOVED_MAIN_TIP: '4'.repeat(40),
  MOVED_BRANCH_TIP:      '6'.repeat(40),
  SECOND_TICKET_TIP:     '8'.repeat(40),
  MOVED_BRANCH_TREE:     'c'.repeat(40),
  OTHER_TREE:            'd'.repeat(40),
} as const;

/** One ticket's Airlock on the main line, as its repository stands when the answering starts. */
export interface MainLineLanding {
  ticketId:       string;
  repository:     string;
  worktree:       string;
  mainTip?:       string;
  branchTip?:     string;
  branchTree?:    string;
  /** The tree of the worktree's HEAD before any merge-in: the branch tree unless set; null when it cannot be read. */
  headTree?:      string | null;
  /** The branch already holds the main tip, so nothing is merged in and the branch tip lands. True unless set. */
  holdsMainLine?: boolean;
  checkedOut?:    string;
  /** The main checkout's tracked files: `modified` holds base.ts changed, which blocks the fast-forward. */
  checkout?:      'clean' | 'modified';
  /** What else answers once the branch landed, such as the next candidate's reads. */
  afterLanding?:  RecordedGitStage;
}

export interface MainLineAnswers {
  beforeTheMergeIn: RecordedGitStage;
  /** The main tip merged in as `MERGED_TIP`, the worktree not yet reset. */
  mergedIn:         RecordedGitStage;
}

function landingOn(landing: Required<Omit<MainLineLanding, 'headTree' | 'afterLanding'>>, commit: string, landed: RecordedGitStage): RecordedGitStep[] {
  const {
    repository, mainTip, checkedOut, checkout
  } = landing;
  const blocked = checkout === 'modified';
  const fastForward = ['merge', '--ff-only', '--quiet', commit];
  return [
    stepIn(repository, currentBranchRead(checkedOut)),
    stepIn(repository, {
      gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      answeredAs:   blocked ? GIT_CALL_SHAPES.NUL_STATUS_OF_A_MODIFIED_BASE : GIT_CALL_SHAPES.NUL_STATUS_OF_A_CLEAN_CHECKOUT,
    }),
    stepIn(repository, {
      gitArguments: ['status', '--porcelain=v1', '--untracked-files=no'],
      answeredAs:   blocked ? GIT_CALL_SHAPES.STATUS_OF_TRACKED_FILES_MODIFIED : GIT_CALL_SHAPES.STATUS_OF_TRACKED_FILES_CLEAN,
    }),
    stepIn(repository, {
      gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', commit, '--'],
      answeredAs:   GIT_CALL_SHAPES.FILES_CHANGED_UP_TO_A_COMMIT,
      filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: 'base.ts' },
    }),
    stepIn(repository, blocked
      ? { gitArguments: fastForward, answeredAs: GIT_CALL_SHAPES.FAST_FORWARD_BLOCKED_BY_MODIFIED, filledIn: { [RECORDED_PLACEHOLDERS.COMMIT]: commit } }
      : { gitArguments: fastForward, answeredAs: GIT_CALL_SHAPES.FAST_FORWARD_TO_A_COMMIT, movesTo: landed }),
    ancestryAsked(commit, mainTip, commit === mainTip),
  ];
}

/**
 * The answer sets of one ticket's Airlock on the main line: its predictions, its merge-in, its tree reads, an abort's reset and its
 * fast-forward landing, each set handing on to the next as a call moves the repository.
 */
function mainLineAnswersOf(landing: MainLineLanding): MainLineAnswers {
  const settled = {
    mainTip: MAIN_TIP, branchTip: TICKET_TIP, branchTree: TICKET_TREE, holdsMainLine: true, checkedOut: MAIN_LINE, checkout: 'clean' as const, ...landing,
  };
  const {
    ticketId, repository, worktree, mainTip, branchTip, branchTree, holdsMainLine
  } = settled;
  const headTree = landing.headTree === undefined ? branchTree : landing.headTree;
  const branch = `ticket-${ticketId}`;
  const beforeTheMerge: RecordedGitStep[] = [];
  const merged: RecordedGitStep[] = [];
  const landedOf = (commit: string): RecordedGitStep[] => [
    treeRead(`refs/heads/${branch}`, branchTree),
    commitResolved(`refs/heads/${branch}`, branchTip),
    commitResolved(`refs/heads/${MAIN_LINE}`, commit),
    stepIn(repository, commitResolved('HEAD', commit)),
    stepIn(worktree, commitResolved('HEAD', commit)),
    ancestryAsked(commit, commit, true),
    ...landing.afterLanding ?? [],
  ];
  const branchReads: RecordedGitStep[] = [
    treeRead(`refs/heads/${branch}`, branchTree),
    commitResolved(`refs/heads/${branch}`, branchTip),
    mergePredicted(MAIN_LINE, branch, holdsMainLine ? branchTree : MERGED_TREE),
    commitResolved(`refs/heads/${MAIN_LINE}`, mainTip),
    stepIn(worktree, revisionMissing('MERGE_HEAD')),
    commitResolved(mainTip, mainTip),
    commitResolved(branchTip, branchTip),
    ancestryAsked(mainTip, branchTip, holdsMainLine),
    treeRead(branchTip, branchTree),
  ];
  const resetToTheBranchTip = { gitArguments: ['reset', '--hard', '--quiet', branchTip], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT, movesTo: beforeTheMerge };
  beforeTheMerge.push(
    ...branchReads,
    stepIn(worktree, commitResolved('HEAD', branchTip)),
    stepIn(worktree, headTree === null
      ? { gitArguments: ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'], answeredAs: GIT_CALL_SHAPES.TREE_OF_A_MISSING_REVISION }
      : treeRead('HEAD', headTree)),
    resetToTheBranchTip,
    stepIn(worktree, { ...mergedIn(mainTip), movesTo: merged }),
    ...landingOn(settled, branchTip, landedOf(branchTip)),
  );
  merged.push(
    ...branchReads,
    stepIn(worktree, commitResolved('HEAD', MERGED_TIP)),
    stepIn(worktree, treeRead('HEAD', MERGED_TREE)),
    resetToTheBranchTip,
    ...landingOn(settled, MERGED_TIP, landedOf(MERGED_TIP)),
  );
  return { beforeTheMergeIn: beforeTheMerge, mergedIn: merged };
}

export const AirlockAnswerSets = {
  mainLineAnswersOf,

  /** The merge-in stands stopped on its conflict, as an Airlock agent leaves it before it commits: it can be checked or aborted. */
  stoppedOnTheConflict: (unmergedPaths: boolean): RecordedGitStage => [
    ...unmergedPaths ? [{ gitArguments: ['ls-files', '-u'], answeredAs: GIT_CALL_SHAPES.UNMERGED_FILES_ONE }] : [],
    ...abortedMergeIn,
  ],

  /**
   * The order a sweep asks in when it aborts an orphaned merge-in and then takes the Airlock again for the requeued ticket. A slot found
   * mid-merge is first checked for `MERGE_HEAD`; a slot whose agent stopped is not.
   */
  abortedAndMergedInAgain: (ticketId: string, holderCheckFirst: boolean): RecordedGitStage => {
    const branchTree = treeRead(`refs/heads/ticket-${ticketId}`, TICKET_TREE);
    const branchTip = commitResolved(`refs/heads/ticket-${ticketId}`, TICKET_TIP);
    const mainTip = commitResolved(`refs/heads/${MAIN_LINE}`, MAIN_TIP);
    return [
      ...holderCheckFirst ? [commitResolved('MERGE_HEAD', MAIN_TIP)] : [],
      ...abortedMergeIn,
      branchTree,
      branchTree,
      branchTip,
      mergeTree(MAIN_LINE, `ticket-${ticketId}`, true),
      mainTip,
      mainTip,
      branchTip,
      branchTree,
      revisionMissing('MERGE_HEAD'),
      commitResolved(MAIN_TIP, MAIN_TIP),
      commitResolved('HEAD', TICKET_TIP),
      ancestryAsked(MAIN_TIP, TICKET_TIP, false),
      ...mergeInOfAConflict(MAIN_TIP),
    ];
  },

  /** The branch and the main line both changed `shared.txt`: the merge-in in the ticket worktree stops on the conflict. */
  conflictingMergeIn: (ticketId: string): RecordedGitStage => [
    ...beforeTheMergeIn(ticketId, true),
    ancestryAsked(MAIN_TIP, TICKET_TIP, false),
    ...mergeInOfAConflict(MAIN_TIP),
  ],

  /** The Airlock agent committed its resolution as `MERGED_TIP`; the checks pass and the main line fast-forwards to it. */
  resolvedAndMerged: (): RecordedGitStage => [
    { gitArguments: ['ls-files', '-u'], answeredAs: GIT_CALL_SHAPES.NO_UNMERGED_PATH },
    {
      gitArguments: ['rev-list', '--merges', '--reverse', `${TICKET_TIP}..HEAD`, `^${MAIN_TIP}`],
      answeredAs:   GIT_CALL_SHAPES.MERGE_IN_RANGE,
      filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: MERGED_TIP },
    },
    { gitArguments: ['config', '--get', 'core.whitespace'], answeredAs: GIT_CALL_SHAPES.WHITESPACE_RULE_UNSET },
    {
      gitArguments: ['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', TICKET_TIP, 'HEAD', '--', CONFLICTED_FILE],
      answeredAs:   GIT_CALL_SHAPES.CHECK_OF_A_CLEAN_CRLF_RESOLUTION,
    },
    {
      gitArguments: ['rev-list', '--parents', '-n', '1', MERGED_TIP],
      answeredAs:   GIT_CALL_SHAPES.PARENTS_OF_THE_MERGE,
      filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: MERGED_TIP, [RECORDED_PLACEHOLDERS.FIRST_TIP]: TICKET_TIP, [RECORDED_PLACEHOLDERS.SECOND_TIP]: MAIN_TIP },
    },
    treeRead('HEAD', MERGED_TREE),
    treeRead(TICKET_TIP, TICKET_TREE),
    commitResolved('HEAD', MERGED_TIP),
    currentBranchRead(MAIN_LINE),
    commitResolved(`refs/heads/${MAIN_LINE}`, MAIN_TIP),
    { gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all'], answeredAs: GIT_CALL_SHAPES.NUL_STATUS_OF_A_CLEAN_CHECKOUT },
    {
      gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', MERGED_TIP, '--'],
      answeredAs:   GIT_CALL_SHAPES.FILES_CHANGED_UP_TO_A_COMMIT,
      filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: CONFLICTED_FILE },
    },
    { gitArguments: ['merge', '--ff-only', '--quiet', MERGED_TIP], answeredAs: GIT_CALL_SHAPES.FAST_FORWARD_TO_A_COMMIT },
  ],

  /**
   * The branch already holds the main line, so its tree is the merged tree; the merge never fast-forwards. A red gate's later passes read
   * the same trees, and the abort past the resumes resets the worktree to the branch tip.
   */
  branchHoldingTheMainLine: (ticketId: string): RecordedGitStage => [
    ...beforeTheMergeIn(ticketId, false),
    ancestryAsked(MAIN_TIP, TICKET_TIP, true),
    treeRead('HEAD', TICKET_TREE),
    treeRead(TICKET_TIP, TICKET_TREE),
    commitResolved(TICKET_TIP, TICKET_TIP),
    { gitArguments: ['reset', '--hard', '--quiet', TICKET_TIP], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT },
  ],

  /** A group refresh of `group-<group>` whose merge-in of the main line conflicts, in the order it asks: aborted, reset and removed. */
  conflictingGroupRefresh: (harness: AirlocksHarness, group: string): RecordedGitStage => {
    const groupBranch = `group-${group}`;
    const refreshWorktree = join(`${harness.repository}-worktrees`, `refresh-${groupBranch}`);
    const bothTips = [commitResolved(`refs/heads/${groupBranch}`, GROUP_TIP), commitResolved(`refs/heads/${MAIN_LINE}`, MAIN_TIP)];
    return [
      ...bothTips,
      { gitArguments: ['rev-list', '--count', `${groupBranch}..${MAIN_LINE}`], answeredAs: GIT_CALL_SHAPES.COMMITS_AHEAD_ONE },
      mergeTree(groupBranch, MAIN_LINE, true),
      ...bothTips,
      { gitArguments: ['worktree', 'add', '--quiet', '--detach', refreshWorktree, GROUP_TIP], answeredAs: GIT_CALL_SHAPES.WORKTREE_ADD_DETACHED, leavesFolder: refreshWorktree },
      revisionMissing('MERGE_HEAD'),
      commitResolved(MAIN_TIP, MAIN_TIP),
      commitResolved('HEAD', GROUP_TIP),
      ancestryAsked(MAIN_TIP, GROUP_TIP, false),
      ...mergeInOfAConflict(MAIN_TIP),
      ...mergeInAborted(MAIN_TIP, GROUP_TIP),
      { gitArguments: ['worktree', 'remove', refreshWorktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_CLEAN_WORKTREE, removesFolder: refreshWorktree },
      ...bothTips,
      ...bothTips,
    ];
  },
} as const;
