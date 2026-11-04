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
    ? { gitArguments, answeredAs: GIT_CALL_SHAPES.MERGE_TREE_OF_A_CONFLICT }
    : { gitArguments, answeredAs: GIT_CALL_SHAPES.MERGE_TREE_OF_A_CLEAN_MERGE, filledIn: { [RECORDED_PLACEHOLDERS.TREE]: TICKET_TREE } };
}

const mergeInOfAConflict = (commit: string): RecordedGitStep[] => [
  { gitArguments: ['merge', '--no-ff', '--no-edit', '--quiet', commit], answeredAs: GIT_CALL_SHAPES.MERGE_IN_OF_A_CONFLICT },
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

export const AirlockAnswerSets = {
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
    { gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all'], answeredAs: GIT_CALL_SHAPES.STATUS_OF_ALL_FILES_CLEAN },
    {
      gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', MERGED_TIP, '--'],
      answeredAs:   GIT_CALL_SHAPES.CHANGED_FILE_NAMES_ONE,
      filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: CONFLICTED_FILE },
    },
    { gitArguments: ['merge', '--ff-only', '--quiet', MERGED_TIP], answeredAs: GIT_CALL_SHAPES.FAST_FORWARD_MERGE },
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
