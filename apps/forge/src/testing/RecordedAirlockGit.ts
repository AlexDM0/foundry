/**
 * Recorded git for the Airlock specs: planted object ids, a planted repository folder, and the git steps of an Airlock's prediction,
 * merge-in, tree reads and landing, each answered by `src/testing/RecordedGit.ts`. Test-only.
 */
import { createHash } from 'node:crypto';
import { mkdirSync }  from 'node:fs';
import { join }       from 'node:path';

import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStage,
  type RecordedGitStep
} from './RecordedGit.ts';
import { createScratchDirectory } from './ScratchWorkspace.ts';

const {
  BRANCH, COMMIT, PATH, REPOSITORY, TREE
} = RECORDED_PLACEHOLDERS;

function plantedObjectId(kind: string, name: string): string {
  return createHash('sha1').update(`${kind} ${name}`).digest('hex');
}

/** The commit a planted branch, or a planted merge, stands on. */
export function plantedCommitOf(name: string): string {
  return plantedObjectId('commit', name);
}

export function plantedTreeOf(name: string): string {
  return plantedObjectId('tree', name);
}

/** A scratch folder with an empty `.git` folder, which a recorded `--git-common-dir` answer names, so production can resolve it. */
export function createPlantedRepository(prefix: string): string {
  const repository = createScratchDirectory(prefix);
  mkdirSync(join(repository, '.git'));
  return repository;
}

export function treeRead(revision: string, tree: string): RecordedGitStep {
  return { gitArguments: ['rev-parse', '--verify', '--quiet', `${revision}^{tree}`], answeredAs: GIT_CALL_SHAPES.TREE_OF_A_REVISION, filledIn: { [TREE]: tree } };
}

export function branchTreeRead(branch: string): RecordedGitStep {
  return treeRead(`refs/heads/${branch}`, plantedTreeOf(branch));
}

const resolvedArguments = (revision: string): string[] => ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`];

export function commitResolved(revision: string, commit: string): RecordedGitStep {
  return { gitArguments: resolvedArguments(revision), answeredAs: GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED, filledIn: { [COMMIT]: commit } };
}

export function revisionMissing(revision: string): RecordedGitStep {
  return { gitArguments: resolvedArguments(revision), answeredAs: GIT_CALL_SHAPES.RESOLVED_MISSING_REVISION };
}

export function currentBranchRead(branch: string): RecordedGitStep {
  return { gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'], answeredAs: GIT_CALL_SHAPES.CURRENT_BRANCH, filledIn: { [BRANCH]: branch } };
}

export function worktreeBranchRead(branch: string): RecordedGitStep {
  return { gitArguments: ['symbolic-ref', '--quiet', 'HEAD'], answeredAs: GIT_CALL_SHAPES.BRANCH_OF_A_WORKTREE, filledIn: { [BRANCH]: branch } };
}

/** `conflictedFile` null predicts a clean merge into `mergedTree`. */
export function mergePredicted(target: string, branch: string, mergedTree: string, conflictedFile: string | null = null): RecordedGitStep {
  const gitArguments = ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--end-of-options', target, branch];
  return conflictedFile === null
    ? { gitArguments, answeredAs: GIT_CALL_SHAPES.MERGE_TREE_OF_A_CLEAN_MERGE, filledIn: { [TREE]: mergedTree } }
    : { gitArguments, answeredAs: GIT_CALL_SHAPES.MERGE_TREE_OF_A_CONFLICT, filledIn: { [TREE]: mergedTree, [PATH]: conflictedFile } };
}

export function ancestryAsked(targetTip: string, branchTip: string, targetTipIsAncestor: boolean): RecordedGitStep {
  return {
    gitArguments: ['merge-base', '--is-ancestor', targetTip, branchTip],
    answeredAs:   targetTipIsAncestor ? GIT_CALL_SHAPES.ANCESTOR_CONFIRMED : GIT_CALL_SHAPES.ANCESTOR_DENIED,
  };
}

/** `conflictedFile` null merges clean. */
export function mergedIn(commit: string, conflictedFile: string | null = null): RecordedGitStep {
  const gitArguments = ['merge', '--no-ff', '--no-edit', '--quiet', commit];
  return conflictedFile === null
    ? { gitArguments, answeredAs: GIT_CALL_SHAPES.MERGE_IN_CLEAN }
    : { gitArguments, answeredAs: GIT_CALL_SHAPES.MERGE_IN_CONFLICTED, filledIn: { [PATH]: conflictedFile } };
}

/** `step`, answered only for a call asked in `directory`. */
export function stepIn(directory: string, step: RecordedGitStep): RecordedGitStep {
  return { ...step, directory };
}

export function unmergedFilesRead(conflictedFile: string): RecordedGitStep {
  return { gitArguments: ['diff', '--name-only', '--diff-filter=U', '-z'], answeredAs: GIT_CALL_SHAPES.UNMERGED_FILES_OF_A_CONFLICT, filledIn: { [PATH]: conflictedFile } };
}

/** The steps that abort a merge-in of `targetTip` stopped on its conflict and put the worktree back at `branchTip`. */
export function mergeInAborted(targetTip: string, branchTip: string): RecordedGitStage {
  return [
    commitResolved('MERGE_HEAD', targetTip),
    { gitArguments: ['merge', '--abort'], answeredAs: GIT_CALL_SHAPES.MERGE_ABORT_OF_A_CONFLICT },
    ...hardResetTo(branchTip),
  ];
}

/** The steps that read a conflicted merge-in, abort it and put the worktree back at `branchTip`. */
export function conflictAborted(targetTip: string, branchTip: string, conflictedFile: string): RecordedGitStage {
  return [unmergedFilesRead(conflictedFile), ...mergeInAborted(targetTip, branchTip)];
}

export function hardResetTo(commit: string): RecordedGitStage {
  return [
    commitResolved(commit, commit),
    { gitArguments: ['reset', '--hard', '--quiet', commit], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT },
    commitResolved('HEAD', commit),
  ];
}

/** A clean checkout of `target` fast-forwarded to `commit`, which changes `changedFile`. */
export function fastForwardLanding(target: string, targetTip: string, commit: string, changedFile: string): RecordedGitStage {
  return [
    currentBranchRead(target),
    commitResolved(`refs/heads/${target}`, targetTip),
    { gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all'], answeredAs: GIT_CALL_SHAPES.NUL_STATUS_OF_A_CLEAN_CHECKOUT },
    {
      gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', commit, '--'],
      answeredAs:   GIT_CALL_SHAPES.FILES_CHANGED_UP_TO_A_COMMIT,
      filledIn:     { [PATH]: changedFile },
    },
    { gitArguments: ['merge', '--ff-only', '--quiet', commit], answeredAs: GIT_CALL_SHAPES.FAST_FORWARD_TO_A_COMMIT },
    commitResolved('HEAD', commit),
  ];
}

export function emptyRangeCounted(branch: string, target: string): RecordedGitStep {
  return { gitArguments: ['rev-list', '--count', `${branch}..${target}`], answeredAs: GIT_CALL_SHAPES.COUNT_OF_AN_EMPTY_RANGE };
}

/** `worktreeStateOf` reading a linked worktree of `repository`: both folders must exist, as git's printed paths are resolved. */
export function linkedWorktreeRead(worktree: string, repository: string): RecordedGitStage {
  return [
    {
      gitArguments: ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'],
      answeredAs:   GIT_CALL_SHAPES.WORKTREE_TOP_AND_COMMON_FOLDER,
      filledIn:     { [PATH]: worktree, [REPOSITORY]: repository },
    },
    {
      gitArguments: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      answeredAs:   GIT_CALL_SHAPES.ABSOLUTE_COMMON_FOLDER_AT_THE_ROOT,
      filledIn:     { [REPOSITORY]: repository },
    },
  ];
}
