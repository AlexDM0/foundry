/**
 * The recorded git answers of one ticket's Airlock on the main line, one set for each state its repository is in, and the ordered stage of
 * a group refresh that stops on a conflict, for a harness of `createRecordedAirlocksHarness`. Test-only.
 */
import { join } from 'node:path';

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

function resolvedTo(revision: string, commit: string): RecordedGitStep {
  return {
    gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`],
    answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
    filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: commit },
  };
}

function unresolved(revision: string): RecordedGitStep {
  return { gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`], answeredAs: GIT_CALL_SHAPES.RESOLVED_MISSING_REVISION };
}

function treeOf(revision: string, tree: string): RecordedGitStep {
  const gitArguments = ['rev-parse', '--verify', '--quiet', `${revision}^{tree}`];
  return { gitArguments, answeredAs: GIT_CALL_SHAPES.TREE_OF_A_REVISION, filledIn: { [RECORDED_PLACEHOLDERS.TREE]: tree } };
}

function ancestry(ancestor: string, descendant: string, isAncestor: boolean): RecordedGitStep {
  return { gitArguments: ['merge-base', '--is-ancestor', ancestor, descendant], answeredAs: isAncestor ? GIT_CALL_SHAPES.IS_AN_ANCESTOR : GIT_CALL_SHAPES.IS_NO_ANCESTOR };
}

function mergeTree(target: string, branch: string, conflicts: boolean): RecordedGitStep {
  const gitArguments = ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', target, branch];
  return conflicts
    ? { gitArguments, answeredAs: GIT_CALL_SHAPES.MERGE_TREE_OF_A_CONFLICT, filledIn: { [RECORDED_PLACEHOLDERS.PATH]: CONFLICTED_FILE } }
    : { gitArguments, answeredAs: GIT_CALL_SHAPES.MERGE_TREE_OF_A_CLEAN_MERGE, filledIn: { [RECORDED_PLACEHOLDERS.TREE]: TICKET_TREE } };
}

const mergeInOfAConflict = (commit: string): RecordedGitStep[] => [
  {
    gitArguments: ['merge', '--no-ff', '--no-edit', '--quiet', commit],
    answeredAs:   GIT_CALL_SHAPES.MERGE_IN_CONFLICTED,
    filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: CONFLICTED_FILE },
  },
  { gitArguments: ['diff', '--name-only', '--diff-filter=U', '-z'], answeredAs: GIT_CALL_SHAPES.CONFLICTED_FILES_OF_A_MERGE },
];

/** The ticket's branch and the main line as they stand when the Airlock is taken, before any merge-in. */
function beforeTheMergeIn(ticketId: string, conflicts: boolean): RecordedGitStep[] {
  return [
    treeOf(`refs/heads/ticket-${ticketId}`, TICKET_TREE),
    resolvedTo(`refs/heads/ticket-${ticketId}`, TICKET_TIP),
    mergeTree(MAIN_LINE, `ticket-${ticketId}`, conflicts),
    resolvedTo(`refs/heads/${MAIN_LINE}`, MAIN_TIP),
    unresolved('MERGE_HEAD'),
    resolvedTo(MAIN_TIP, MAIN_TIP),
    resolvedTo('HEAD', TICKET_TIP),
  ];
}

/** A merge-in stopped on its conflict, aborted and reset to the ticket's branch tip. */
const abortedMergeIn: RecordedGitStep[] = [
  resolvedTo('MERGE_HEAD', MAIN_TIP),
  { gitArguments: ['merge', '--abort'], answeredAs: GIT_CALL_SHAPES.MERGE_ABORT_OF_A_CONFLICT },
  resolvedTo(TICKET_TIP, TICKET_TIP),
  { gitArguments: ['reset', '--hard', '--quiet', TICKET_TIP], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT },
  resolvedTo('HEAD', TICKET_TIP),
];

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

/** `step`, answered only for a call asked in `directory`. */
export function stepIn(directory: string, step: RecordedGitStep): RecordedGitStep {
  return { ...step, directory };
}

function landingOn(landing: Required<Omit<MainLineLanding, 'headTree' | 'afterLanding'>>, commit: string, landed: RecordedGitStage): RecordedGitStep[] {
  const {
    repository, mainTip, checkedOut, checkout
  } = landing;
  const blocked = checkout === 'modified';
  const fastForward = ['merge', '--ff-only', '--quiet', commit];
  const branchCheckedOut = { [RECORDED_PLACEHOLDERS.BRANCH]: checkedOut };
  return [
    stepIn(repository, { gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'], answeredAs: GIT_CALL_SHAPES.CURRENT_BRANCH, filledIn: branchCheckedOut }),
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
    ancestry(commit, mainTip, commit === mainTip),
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
    treeOf(`refs/heads/${branch}`, branchTree),
    resolvedTo(`refs/heads/${branch}`, branchTip),
    resolvedTo(`refs/heads/${MAIN_LINE}`, commit),
    stepIn(repository, resolvedTo('HEAD', commit)),
    stepIn(worktree, resolvedTo('HEAD', commit)),
    ancestry(commit, commit, true),
    ...landing.afterLanding ?? [],
  ];
  const branchReads: RecordedGitStep[] = [
    treeOf(`refs/heads/${branch}`, branchTree),
    resolvedTo(`refs/heads/${branch}`, branchTip),
    {
      gitArguments: ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', MAIN_LINE, branch],
      answeredAs:   GIT_CALL_SHAPES.MERGE_TREE_OF_A_CLEAN_MERGE,
      filledIn:     { [RECORDED_PLACEHOLDERS.TREE]: holdsMainLine ? branchTree : MERGED_TREE },
    },
    resolvedTo(`refs/heads/${MAIN_LINE}`, mainTip),
    stepIn(worktree, unresolved('MERGE_HEAD')),
    resolvedTo(mainTip, mainTip),
    resolvedTo(branchTip, branchTip),
    ancestry(mainTip, branchTip, holdsMainLine),
    treeOf(branchTip, branchTree),
  ];
  const resetToTheBranchTip = { gitArguments: ['reset', '--hard', '--quiet', branchTip], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT, movesTo: beforeTheMerge };
  beforeTheMerge.push(
    ...branchReads,
    stepIn(worktree, resolvedTo('HEAD', branchTip)),
    stepIn(worktree, headTree === null
      ? { gitArguments: ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'], answeredAs: GIT_CALL_SHAPES.TREE_OF_A_MISSING_REVISION }
      : treeOf('HEAD', headTree)),
    resetToTheBranchTip,
    stepIn(worktree, { gitArguments: ['merge', '--no-ff', '--no-edit', '--quiet', mainTip], answeredAs: GIT_CALL_SHAPES.MERGE_IN_CLEAN, movesTo: merged }),
    ...landingOn(settled, branchTip, landedOf(branchTip)),
  );
  merged.push(
    ...branchReads,
    stepIn(worktree, resolvedTo('HEAD', MERGED_TIP)),
    stepIn(worktree, treeOf('HEAD', MERGED_TREE)),
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
    const branchTree = treeOf(`refs/heads/ticket-${ticketId}`, TICKET_TREE);
    const branchTip = resolvedTo(`refs/heads/ticket-${ticketId}`, TICKET_TIP);
    const mainTip = resolvedTo(`refs/heads/${MAIN_LINE}`, MAIN_TIP);
    return [
      ...holderCheckFirst ? [resolvedTo('MERGE_HEAD', MAIN_TIP)] : [],
      ...abortedMergeIn,
      branchTree,
      branchTree,
      branchTip,
      mergeTree(MAIN_LINE, `ticket-${ticketId}`, true),
      mainTip,
      mainTip,
      branchTip,
      branchTree,
      unresolved('MERGE_HEAD'),
      resolvedTo(MAIN_TIP, MAIN_TIP),
      resolvedTo('HEAD', TICKET_TIP),
      ancestry(MAIN_TIP, TICKET_TIP, false),
      ...mergeInOfAConflict(MAIN_TIP),
    ];
  },

  /** The branch and the main line both changed `shared.txt`: the merge-in in the ticket worktree stops on the conflict. */
  conflictingMergeIn: (ticketId: string): RecordedGitStage => [
    ...beforeTheMergeIn(ticketId, true),
    ancestry(MAIN_TIP, TICKET_TIP, false),
    ...mergeInOfAConflict(MAIN_TIP),
  ],

  /** The Airlock agent committed its resolution as `MERGED_TIP`; the checks pass and the main line fast-forwards to it. */
  resolvedAndMerged: (): RecordedGitStage => [
    { gitArguments: ['ls-files', '-u'], answeredAs: GIT_CALL_SHAPES.UNMERGED_FILES_NONE },
    {
      gitArguments: ['rev-list', '--merges', '--reverse', `${TICKET_TIP}..HEAD`, `^${MAIN_TIP}`],
      answeredAs:   GIT_CALL_SHAPES.MERGES_SINCE_ONE,
      filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: MERGED_TIP },
    },
    { gitArguments: ['config', '--get', 'core.whitespace'], answeredAs: GIT_CALL_SHAPES.WHITESPACE_SETTING_UNSET },
    { gitArguments: ['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', TICKET_TIP, 'HEAD', '--', CONFLICTED_FILE], answeredAs: GIT_CALL_SHAPES.WHITESPACE_CHECK_CLEAN },
    {
      gitArguments: ['rev-list', '--parents', '-n', '1', MERGED_TIP],
      answeredAs:   GIT_CALL_SHAPES.PARENTS_OF_A_MERGE,
      filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: MERGED_TIP, [RECORDED_PLACEHOLDERS.FIRST_TIP]: TICKET_TIP, [RECORDED_PLACEHOLDERS.SECOND_TIP]: MAIN_TIP },
    },
    treeOf('HEAD', MERGED_TREE),
    treeOf(TICKET_TIP, TICKET_TREE),
    resolvedTo('HEAD', MERGED_TIP),
    { gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'], answeredAs: GIT_CALL_SHAPES.CURRENT_BRANCH, filledIn: { [RECORDED_PLACEHOLDERS.BRANCH]: MAIN_LINE } },
    resolvedTo(`refs/heads/${MAIN_LINE}`, MAIN_TIP),
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
    ancestry(MAIN_TIP, TICKET_TIP, true),
    treeOf('HEAD', TICKET_TREE),
    treeOf(TICKET_TIP, TICKET_TREE),
    resolvedTo(TICKET_TIP, TICKET_TIP),
    { gitArguments: ['reset', '--hard', '--quiet', TICKET_TIP], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT },
  ],

  /** A group refresh of `group-<group>` whose merge-in of the main line conflicts, in the order it asks: aborted, reset and removed. */
  conflictingGroupRefresh: (harness: AirlocksHarness, group: string): RecordedGitStage => {
    const groupBranch = `group-${group}`;
    const refreshWorktree = join(`${harness.repository}-worktrees`, `refresh-${groupBranch}`);
    const bothTips = [resolvedTo(`refs/heads/${groupBranch}`, GROUP_TIP), resolvedTo(`refs/heads/${MAIN_LINE}`, MAIN_TIP)];
    return [
      ...bothTips,
      { gitArguments: ['rev-list', '--count', `${groupBranch}..${MAIN_LINE}`], answeredAs: GIT_CALL_SHAPES.COMMITS_AHEAD_ONE },
      mergeTree(groupBranch, MAIN_LINE, true),
      ...bothTips,
      { gitArguments: ['worktree', 'add', '--quiet', '--detach', refreshWorktree, GROUP_TIP], answeredAs: GIT_CALL_SHAPES.WORKTREE_ADD_DETACHED, leavesFolder: refreshWorktree },
      unresolved('MERGE_HEAD'),
      resolvedTo(MAIN_TIP, MAIN_TIP),
      resolvedTo('HEAD', GROUP_TIP),
      ancestry(MAIN_TIP, GROUP_TIP, false),
      ...mergeInOfAConflict(MAIN_TIP),
      resolvedTo('MERGE_HEAD', MAIN_TIP),
      { gitArguments: ['merge', '--abort'], answeredAs: GIT_CALL_SHAPES.MERGE_ABORT_OF_A_CONFLICT },
      resolvedTo(GROUP_TIP, GROUP_TIP),
      { gitArguments: ['reset', '--hard', '--quiet', GROUP_TIP], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT },
      resolvedTo('HEAD', GROUP_TIP),
      { gitArguments: ['worktree', 'remove', refreshWorktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_CLEAN_WORKTREE, removesFolder: refreshWorktree },
      ...bothTips,
      ...bothTips,
    ];
  },
} as const;
