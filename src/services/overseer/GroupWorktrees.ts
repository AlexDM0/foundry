/**
 * A group's own worktree, `<worktrees>/group-<name>/` on `group-<name>` (design section 6.7): created from the main line's tip at the
 * group's first launch, touched afterwards only by landings, and removed with its branch once the release delivered the bundle. A refresh
 * merges main in a temporary detached worktree beside it, which its refresh job owns.
 */
import { join } from 'node:path';

import { GitProcess }   from '../../lib/git/GitProcess.ts';
import { GitWorktrees } from '../../lib/git/GitWorktrees.ts';

export type GroupWorktreeVerdict = { verdict: 'ready'; path: string } | { verdict: 'git-failed'; reason: string };

const REFRESH_FOLDER_PREFIX = 'refresh-';

function groupWorktreeOf(worktreesRoot: string, groupBranch: string): string {
  return join(worktreesRoot, groupBranch);
}

function refreshWorktreeOf(worktreesRoot: string, groupBranch: string): string {
  return join(worktreesRoot, `${REFRESH_FOLDER_PREFIX}${groupBranch}`);
}

function leftoverRefusalOf(path: string): GroupWorktreeVerdict {
  return { verdict: 'git-failed', reason: `The leftover folder ${path} is not a checkout of the repository.` };
}

/**
 * Read from git, never from the folder name: on a case-insensitive file system `group-Example` and `group-example` are one folder, which must
 * not answer ready for the other group.
 */
function checkoutIsOnBranch(path: string, branch: string): boolean {
  const run = GitProcess.run(path, ['symbolic-ref', '--quiet', 'HEAD'], 'hooks-off', undefined, GitWorktrees.ceilingOf(path));
  return GitProcess.succeeded(run) && run.standardOutput.trim() === `refs/heads/${branch}`;
}

/**
 * A checkout of the repository is used as it stands, when it is on `expectedBranch` (`null` for a detached one); a leftover folder that git
 * does not read as one is never reused.
 */
function addWorktree(repositoryRoot: string, path: string, worktreeArguments: readonly string[], expectedBranch: string | null): GroupWorktreeVerdict {
  const state = GitWorktrees.worktreeStateOf(repositoryRoot, path);
  if (state === 'checkout' && expectedBranch !== null && !checkoutIsOnBranch(path, expectedBranch)) {
    return { verdict: 'git-failed', reason: `The folder ${path} is a checkout of another branch than ${expectedBranch}.` };
  }
  if (state === 'checkout') return { verdict: 'ready', path };
  if (state === 'leftover') return leftoverRefusalOf(path);
  const gitArguments = ['worktree', 'add', '--quiet', ...worktreeArguments];
  const run          = GitProcess.run(repositoryRoot, gitArguments);
  return GitProcess.succeeded(run) ? { verdict: 'ready', path } : { verdict: 'git-failed', reason: GitProcess.failureReasonOf(run, gitArguments) };
}

/** The branch is made from the main line's tip only when it does not exist yet; an existing one is checked out as it stands. */
function prepareGroupWorktree(repositoryRoot: string, worktreesRoot: string, groupBranch: string, mainLine: string): GroupWorktreeVerdict {
  const path         = groupWorktreeOf(worktreesRoot, groupBranch);
  const branchExists = GitProcess.resolvedCommitOf(repositoryRoot, `refs/heads/${groupBranch}`) !== null;
  return addWorktree(repositoryRoot, path, branchExists ? [path, groupBranch] : ['-b', groupBranch, path, mainLine], groupBranch);
}

/** A leftover refresh worktree away from the tip is detached there, unless it holds a merge in progress or uncommitted changes. */
function detachLeftoverAt(path: string, groupTip: string): GroupWorktreeVerdict {
  const ceiling = GitWorktrees.ceilingOf(path);
  if (GitProcess.resolvedCommitOf(path, 'HEAD', ceiling) === groupTip) return { verdict: 'ready', path };
  if (GitProcess.resolvedCommitOf(path, 'MERGE_HEAD', ceiling) !== null) {
    return { verdict: 'git-failed', reason: `The leftover refresh worktree ${path} holds a merge in progress.` };
  }
  const status = GitProcess.run(path, ['status', '--porcelain=v1', '--untracked-files=no'], 'hooks-off', undefined, ceiling);
  if (!GitProcess.succeeded(status) || status.standardOutput.trim() !== '') {
    return { verdict: 'git-failed', reason: `The leftover refresh worktree ${path} holds uncommitted changes.` };
  }
  const gitArguments = ['checkout', '--quiet', '--detach', groupTip];
  const run          = GitProcess.run(path, gitArguments, 'hooks-off', undefined, ceiling);
  return GitProcess.succeeded(run) ? { verdict: 'ready', path } : { verdict: 'git-failed', reason: `${path}: ${GitProcess.failureReasonOf(run, gitArguments)}` };
}

/** Detached at the group's recorded tip, so nothing but the landing's `merge --ff-only` ever moves the group branch. */
function prepareRefreshWorktree(repositoryRoot: string, worktreesRoot: string, groupBranch: string, groupTip: string): GroupWorktreeVerdict {
  const path = refreshWorktreeOf(worktreesRoot, groupBranch);
  if (GitWorktrees.worktreeIsCheckoutOf(repositoryRoot, path)) return detachLeftoverAt(path, groupTip);
  return addWorktree(repositoryRoot, path, ['--detach', path, groupTip], null);
}

/** Whether what a declined cleanup was to remove is still there: a refresh's worktree, or a released group's worktree or branch, a leftover included. */
function cleanupIsStillDeclined(repositoryRoot: string, worktreesRoot: string, groupBranch: string, cleanup: 'refresh' | 'release'): boolean {
  const worktreeIsGone = (path: string): boolean => GitWorktrees.worktreeStateOf(repositoryRoot, path) === 'absent';
  if (cleanup === 'refresh') return !worktreeIsGone(refreshWorktreeOf(worktreesRoot, groupBranch));
  return !worktreeIsGone(groupWorktreeOf(worktreesRoot, groupBranch)) || GitProcess.resolvedCommitOf(repositoryRoot, `refs/heads/${groupBranch}`) !== null;
}

/** Never forced: a worktree git declines to remove stays, and the reason is handed back. */
function removeWorktree(repositoryRoot: string, path: string): string | null {
  const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: repositoryRoot, worktreePath: path, force: 'never-force' });
  return removal.verdict === 'removed' ? null : removal.reason;
}

/** After the release: the group worktree removed, then its branch deleted with `branch -d`, which refuses an unmerged one. */
function removeGroup(repositoryRoot: string, worktreesRoot: string, groupBranch: string): string | null {
  const worktreeFailure = removeWorktree(repositoryRoot, groupWorktreeOf(worktreesRoot, groupBranch));
  if (worktreeFailure !== null) return worktreeFailure;
  const gitArguments = ['branch', '-d', groupBranch];
  const run          = GitProcess.run(repositoryRoot, gitArguments);
  return GitProcess.succeeded(run) ? null : GitProcess.failureReasonOf(run, gitArguments);
}

export const GroupWorktrees = Object.freeze({
  cleanupIsStillDeclined,
  groupWorktreeOf,
  prepareGroupWorktree,
  prepareRefreshWorktree,
  refreshWorktreeOf,
  removeGroup,
  removeWorktree,
});
